const fs = require('fs');
const path = require('path');
const os = require('os');
const lockfile = require('proper-lockfile');
const { getConfig } = require('./config');

const CONFIG_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cc-caffeine');
const SESSIONS_FILE = path.join(CONFIG_DIR, 'sessions.json');
const getSessionTimeout = () => getConfig().session_timeout_minutes * 60 * 1000;
const MAX_RETRIES = 10;

const initSessionsFile = async () => {
  if (!fs.existsSync(SESSIONS_FILE)) {
    const initialData = {
      sessions: {},
      last_updated: new Date().toISOString()
    };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(initialData, null, 2));
  }
};

const readSessionsWithLock = async (retryCount = 0) => {
  try {
    await initSessionsFile();

    const release = await lockfile.lock(SESSIONS_FILE, {
      retries: MAX_RETRIES,
      stale: 30000 // 30 seconds
    });

    try {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
      return JSON.parse(data);
    } finally {
      await release();
    }
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} for readSessionsWithLock`);
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
      return readSessionsWithLock(retryCount + 1);
    }
    throw error;
  }
};

// Note: Individual write operations should use addSession/removeSession for atomicity

const addSessionWithLock = async sessionId => {
  await initSessionsFile();

  const release = await lockfile.lock(SESSIONS_FILE, {
    retries: MAX_RETRIES,
    stale: 30000 // 30 seconds
  });

  try {
    // Read data while holding the lock
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = new Date().toISOString();

    // Clean up expired sessions first
    const nowDate = new Date();
    let removedCount = 0;

    for (const [existingSessionId, sessionData] of Object.entries(data.sessions)) {
      const lastActivity = new Date(sessionData.last_activity);
      const timeDiff = nowDate - lastActivity;

      if (timeDiff >= getSessionTimeout()) {
        delete data.sessions[existingSessionId];
        removedCount++;
      }
    }

    // Add or update the session
    if (data.sessions[sessionId]) {
      // Update existing session's last_activity only
      data.sessions[sessionId].last_activity = now;
    } else {
      // Create new session
      data.sessions[sessionId] = {
        created_at: now,
        last_activity: now,
        project_dir: process.env.CLAUDE_PROJECT_DIR
      };
    }

    // Write updated data while still holding the lock
    data.last_updated = now;
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));

    const isNewSession =
      !data.sessions[sessionId] ||
      (data.sessions[sessionId].created_at === now &&
        data.sessions[sessionId].last_activity === now);
    const action = isNewSession ? 'added' : 'updated';

    // console.error(`Cleaned up ${removedCount} expired sessions and ${action} session: ${sessionId}`);
    return { id: sessionId, cleaned_sessions: removedCount, action };
  } finally {
    await release();
  }
};

const removeSessionWithLock = async sessionId => {
  await initSessionsFile();

  const release = await lockfile.lock(SESSIONS_FILE, {
    retries: MAX_RETRIES,
    stale: 30000 // 30 seconds
  });

  try {
    // Read data while holding the lock
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = new Date().toISOString();
    let changes = 0;

    // Clean up expired sessions first
    const nowDate = new Date();
    let cleanedCount = 0;

    for (const [existingSessionId, sessionData] of Object.entries(data.sessions)) {
      const lastActivity = new Date(sessionData.last_activity);
      const timeDiff = nowDate - lastActivity;

      if (timeDiff >= getSessionTimeout()) {
        delete data.sessions[existingSessionId];
        cleanedCount++;
      }
    }

    // Remove the specific session if it exists
    if (data.sessions[sessionId]) {
      delete data.sessions[sessionId];
      changes = 1;
    }

    // Write updated data while still holding the lock
    if (changes > 0 || cleanedCount > 0) {
      data.last_updated = now;
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    }

    if (cleanedCount > 0) {
      // console.error(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return { changes, cleaned_sessions: cleanedCount };
  } finally {
    await release();
  }
};

const getActiveSessionsWithLock = async () => {
  await initSessionsFile();

  const release = await lockfile.lock(SESSIONS_FILE, {
    retries: MAX_RETRIES,
    stale: 30000 // 30 seconds
  });

  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = new Date();
    const activeSessions = [];

    for (const [sessionId, sessionData] of Object.entries(data.sessions)) {
      const lastActivity = new Date(sessionData.last_activity);
      const timeDiff = now - lastActivity;

      if (timeDiff < getSessionTimeout()) {
        activeSessions.push({
          id: sessionId,
          ...sessionData
        });
      }
    }

    return activeSessions;
  } finally {
    await release();
  }
};

const cleanupExpiredSessionsWithLock = async () => {
  await initSessionsFile();

  const release = await lockfile.lock(SESSIONS_FILE, {
    retries: MAX_RETRIES,
    stale: 30000 // 30 seconds
  });

  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = new Date();
    let removedCount = 0;

    for (const [sessionId, sessionData] of Object.entries(data.sessions)) {
      const lastActivity = new Date(sessionData.last_activity);
      const timeDiff = now - lastActivity;

      if (timeDiff >= getSessionTimeout()) {
        delete data.sessions[sessionId];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      data.last_updated = new Date().toISOString();
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    }

    return { changes: removedCount };
  } finally {
    await release();
  }
};

module.exports = {
  initSessionsFile,
  readSessionsWithLock,
  addSessionWithLock,
  removeSessionWithLock,
  getActiveSessionsWithLock,
  cleanupExpiredSessionsWithLock
};
