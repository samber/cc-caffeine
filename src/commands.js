#!/usr/bin/env node

/**
 * Commands module - Handles all command-line interface functionality
 */

const path = require('path');
const fs = require('fs');

const {
  addSessionWithLock,
  removeSessionWithLock,
  getActiveSessionsWithLock
} = require('./session');
const { isServerRunningWithLock } = require('./pid');
const { runServerProcessIfNotStarted } = require('./server');
const { getConfig } = require('./config');

/**
 * Handle session commands with JSON input from Claude Code hooks
 */
const handleSessionCommand = async (action, sessionOperation) => {
  try {
    // Read session_id from stdin (Claude Code hook format)
    let input = '';
    process.stdin.setEncoding('utf8');

    await new Promise((resolve, reject) => {
      process.stdin.on('data', chunk => (input += chunk));
      process.stdin.on('end', resolve);
      process.stdin.on('error', reject);
    });

    const data = JSON.parse(input);
    const sessionId = data.session_id;

    if (!sessionId) {
      console.error('Error: session_id required in JSON input');
      process.exit(1);
    }

    // Execute the session operation
    const result = await sessionOperation(sessionId);

    // For caffeinate command, ensure server is running
    if (action === 'caffeinate') {
      await runServerProcessIfNotStarted();
    }

    console.error(
      `${action === 'caffeinate' ? 'Enabled' : 'Disabled'} caffeine for session: ${sessionId}`
    );

    // Log cleanup results if any
    if (result.cleaned_sessions > 0) {
      console.error(`Cleaned up ${result.cleaned_sessions} expired sessions`);
    }

    return result;
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

/**
 * Handle caffeinate command
 */
const handleCaffeinate = () => {
  return handleSessionCommand('caffeinate', addSessionWithLock);
};

/**
 * Handle uncaffeinate command
 */
const handleUncaffeinate = () => {
  return handleSessionCommand('uncaffeinate', removeSessionWithLock);
};

/**
 * Handle version command - show version from package.json and plugin.json
 */
const handleVersion = () => {
  try {
    // Read package.json
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const packageVersion = packageData.version || 'unknown';

    // Read plugin.json
    const pluginPath = path.join(__dirname, '..', '.claude-plugin', 'plugin.json');
    let pluginVersion = 'unknown';

    try {
      const pluginData = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
      pluginVersion = pluginData.version || 'unknown';
    } catch (error) {
      pluginVersion = 'not found';
    }

    console.error('=== CC-Caffeine Version ===');
    console.error(`Package version: ${packageVersion}`);
    console.error(`Plugin version:  ${pluginVersion}`);

    if (packageVersion !== pluginVersion && pluginVersion !== 'not found') {
      console.error('⚠️  Warning: Package and plugin versions do not match!');
    }
  } catch (error) {
    console.error('Error getting version:', error.message);
    process.exit(1);
  }
};

/**
 * Handle status command - show current sessions and server status
 */
const handleStatus = async () => {
  try {
    const serverRunning = await isServerRunningWithLock();
    const activeSessions = await getActiveSessionsWithLock();

    console.error('=== CC-Caffeine Status ===');
    console.error(`Server Status: ${serverRunning ? '✅ Running' : '❌ Stopped'}`);
    console.error(`Active Sessions: ${activeSessions.length}`);

    if (activeSessions.length > 0) {
      console.error('\nActive Sessions:');
      activeSessions.forEach((session, index) => {
        const created = new Date(session.created_at).toLocaleString();
        const lastActivity = new Date(session.last_activity).toLocaleString();
        console.error(`  ${index + 1}. ${session.id}`);
        console.error(`     Created: ${created}`);
        console.error(`     Last Activity: ${lastActivity}`);
        if (session.project_dir) {
          console.error(`     Project: ${session.project_dir}`);
        }
      });
    }

    console.error(
      `\nSession timeout: ${getConfig().session_timeout_minutes} minutes of inactivity`
    );
  } catch (error) {
    console.error('Error getting status:', error.message);
    process.exit(1);
  }
};

/**
 * Show usage help
 */
const handleUsage = () => {
  console.error('Usage: npx electron caffeine.js [caffeinate|uncaffeinate|server|status|version]');
  console.error('');
  console.error('Commands:');
  console.error('  caffeinate [session_id]   - Enable caffeine for current session');
  console.error('  uncaffeinate [session_id] - Disable caffeine for current session');
  console.error('  server                    - Start caffeine server with system tray');
  console.error('  status                    - Show current status and active sessions');
  console.error(
    '  version                   - Show version information from package.json and plugin.json'
  );
  process.exit(1);
};

// Export command handlers and utilities
module.exports = {
  // Command handlers
  handleCaffeinate,
  handleUncaffeinate,
  handleStatus,
  handleVersion,
  handleUsage,

  // Session operations
  handleSessionCommand
};
