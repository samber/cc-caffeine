#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');

/**
 * Main entry point for CC-Caffeine application
 *
 * This file contains the main() function and orchestrates all modules.
 * All functionality has been split into separate modules for better organization.
 */

const {
  handleCaffeinate,
  handleUncaffeinate,
  handleStatus,
  handleVersion,
  handleUsage
} = require('./src/commands');
const { handleServer } = require('./src/server');

const CONFIG_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cc-caffeine');

const ensureConfigDir = () => {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Main application entry point
 * Handles command routing and delegates to appropriate modules
 */
const main = async () => {
  ensureConfigDir();

  const command = process.argv[2];

  switch (command) {
    case 'caffeinate':
      await handleCaffeinate();
      break;
    case 'uncaffeinate':
      await handleUncaffeinate();
      break;
    case 'server':
      await handleServer();
      break;
    case 'status':
      await handleStatus();
      break;
    case 'version':
      await handleVersion();
      break;
    default:
      await handleUsage();
  }
};

// Handle uncaught errors gracefully
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
