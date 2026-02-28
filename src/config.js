/**
 * Config module - Reads user configuration from config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.claude', 'plugins', 'cc-caffeine');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  session_timeout_minutes: 15,
  icon_theme: process.platform === 'darwin' ? 'macos' : 'orange' // 'orange' | 'monochrome' | 'macos'
};

let cachedConfig = null;

const getConfig = () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  let userConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Warning: Failed to read config file, using defaults:', error.message);
  }

  cachedConfig = { ...DEFAULTS, ...userConfig };
  return cachedConfig;
};

module.exports = { getConfig };
