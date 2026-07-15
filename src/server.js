/**
 * Server module - Handles server process management and startup
 */

const path = require('path');
const { spawn } = require('child_process');

const { initSessionsFile } = require('./session');
const { getSystemTray, startPolling, shutdownServer } = require('./system-tray');
const {
  isRunningInElectron,
  preventWindowCreation,
  setupAppEventHandlers,
  whenReady,
  quit
} = require('./electron');
const {
  isServerRunning,
  writePidFile,
  withPidLock,
  isStartupInProgress,
  markStartupInProgress
} = require('./pid');

const CHECK_INTERVAL = 5 * 1000; // 10 seconds

/**
 * Ensure server is running, start if needed
 */
const runServerProcessIfNotStarted = async () => {
  let mustStart = false;

  try {
    // Claim the startup inside the lock so concurrent hooks agree on which one
    // of them spawns the server. The spawn itself happens after the lock is
    // released, because the spawned process needs the lock to write its PID.
    await withPidLock(async () => {
      if (await isServerRunning()) {
        console.error('Server is already running');
        return;
      }

      if (await isStartupInProgress()) {
        console.error('Server startup is already in progress');
        return;
      }

      await markStartupInProgress();
      mustStart = true;
    });
  } catch (error) {
    if (error.code === 'ELOCKED') {
      // Another process holds the lock and will decide whether to start.
      console.error('Server startup is being handled by another process');
      return;
    }
    throw error;
  }

  if (mustStart) {
    console.error('Server not running, starting...');
    await startServerProcess();
  }
};

/**
 * Start server process using npm
 */
const startServerProcess = async () => {
  console.error('Starting caffeine server...');

  const cwd = path.join(__dirname, '..');

  const serverProcess = spawn('npm', ['run', 'server'], {
    detached: true,
    stdio: 'ignore',
    cwd // is needed to find the correct caffeine.js
  });

  serverProcess.unref();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 500));

  return true;
};

/**
 * Handle server command - start Electron server or delegate with atomic file locking
 */
const handleServer = async () => {
  let mustStartServer = false;
  let mustStartElectron = false;

  await withPidLock(async () => {
    try {
      // Inside the lock, check if server is already running
      const alreadyRunning = await isServerRunning();
      if (alreadyRunning) {
        console.error('Caffeine server is already running');
        return;
      }

      if (isRunningInElectron()) {
        mustStartServer = true;
        console.error('Already running inside Electron, starting server...');
        await writePidFile(process.pid);
      } else {
        mustStartElectron = true;
        console.error('Not running inside Electron, spawning Electron process...');
      }
    } catch (error) {
      if (error.code === 'ELOCKED' || error.code === 'EEXIST') {
        // Another process has the lock, server is likely starting up
        console.error('Server startup is in progress by another process');
      } else {
        console.error('Failed to acquire server startup lock:', error);
        throw error;
      }
    }
  });

  if (mustStartElectron) {
    await spawnElectronProcess();
  } else if (mustStartServer) {
    await startServer();
  } else if (isRunningInElectron()) {
    await shutdownServer();
    process.exit(0);
  }
};

/**
 * Start server when already inside Electron
 */
const startServer = async () => {
  console.error('Loading Electron...');

  // Prevent any window from being created
  preventWindowCreation();

  // Setup event handlers with shutdown callback
  setupAppEventHandlers(() => {
    // We'll handle shutdown in the main process
    process.exit(0);
  });

  // Wait for app to be ready before starting system tray
  await whenReady();

  // Start the actual server
  try {
    await initSessionsFile();
    const state = getSystemTray();
    startPolling(state, CHECK_INTERVAL);
    console.error('Caffeine server started successfully with system tray');

    // Only setup signal handlers if server actually started
    if (state) {
      // Handle process termination for Electron process
      process.on('SIGINT', async () => {
        console.error('Received SIGINT, shutting down server...');
        await shutdownServer(state);
        quit();
      });

      process.on('SIGTERM', async () => {
        console.error('Received SIGTERM, shutting down server...');
        await shutdownServer(state);
        quit();
      });
    }

    return state;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Spawn new Electron process for server
 */
const spawnElectronProcess = () => {
  const cwd = path.join(__dirname, '..');

  const electronProcess = spawn('npx', ['electron', 'caffeine.js', 'server'], {
    stdio: 'inherit',
    shell: true,
    detached: false,
    cwd // is needed to find caffeine.js
  });

  electronProcess.on('exit', code => {
    process.exit(code || 0);
  });

  electronProcess.on('error', error => {
    console.error('Failed to spawn Electron process:', error);
    process.exit(1);
  });

  electronProcess.on('close', code => {
    process.exit(code || 0);
  });

  return electronProcess.pid;
};

module.exports = {
  handleServer,
  runServerProcessIfNotStarted
};
