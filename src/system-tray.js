/**
 * System Tray module - Handles all system tray functionality
 */

const path = require('path');

const { getActiveSessionsWithLock, cleanupExpiredSessionsWithLock } = require('./session');
const { getElectron } = require('./electron');
const { getConfig } = require('./config');
const { removePidFileWithLock } = require('./pid');
const package = require('../package.json');

let trayState = null;

/**
 * Create icon for system tray
 */
const createIcon = isActive => {
  const { icon_theme } = getConfig();
  let suffix;
  let isMono;
  switch (icon_theme) {
    case 'monochrome':
      suffix = '-mono';
      isMono = true;
      break;
    case 'macos':
      suffix = '-macos';
      isMono = true;
      break;
    default:
      suffix = '';
      isMono = false;
      break;
  }
  const name = isActive ? 'icon-coffee-full' : 'icon-coffee-empty';
  const iconPath = path.join(__dirname, `../assets/${name}${suffix}.png`);
  const { nativeImage } = getElectron();
  const image = nativeImage.createFromPath(iconPath);
  if (isMono && process.platform === 'darwin') {
    image.setTemplateImage(true);
  }
  return image;
};

/**
 * Create system tray
 */
const createSystemTray = () => {
  const { Tray, Menu } = getElectron();

  if (!Tray) {
    throw new Error('Electron Tray is not available');
  }

  try {
    const tray = new Tray(createIcon(false));
    tray.setToolTip('CC-Caffeine: Normal');

    trayState = {
      tray,
      isCaffeinated: false,
      pollInterval: null,
      powerSaveBlockerId: null
    };

    if (!Menu) {
      throw new Error('Electron Menu is not available');
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Version: ${package.version}`,
        enabled: false
      },
      {
        label: 'Github',
        click: () => {
          getElectron().shell.openExternal('https://github.com/samber/cc-caffeine');
        }
      },
      {
        label: '💖 Sponsor',
        click: () => {
          getElectron().shell.openExternal('https://github.com/sponsors/samber');
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Exit',
        click: async () => {
          await shutdownServer(trayState);
          process.exit(0);
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    return trayState;
  } catch (error) {
    console.error('Error creating Electron system tray:', error);
    throw error;
  }
};

/**
 * Get current system tray state
 */
const getSystemTrayState = () => {
  return trayState;
};

/**
 * Get system tray instance
 */
const getSystemTray = () => {
  if (!trayState) {
    return createSystemTray();
  }
  return trayState;
};

/**
 * Update tray icon based on caffeine state
 */
const updateTrayIcon = state => {
  if (!state || !state.tray) {
    return;
  }

  const icon = createIcon(state.isCaffeinated);
  state.tray.setImage(icon);
  state.tray.setToolTip(`CC-Caffeine: ${state.isCaffeinated ? 'Caffeinated' : 'Normal'}`);
};

/**
 * Enable caffeine (prevent sleep)
 */
const enableCaffeine = state => {
  if (!state.isCaffeinated) {
    const { powerSaveBlocker } = getElectron();
    state.isCaffeinated = true;
    state.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  }
};

/**
 * Disable caffeine (allow sleep)
 */
const disableCaffeine = state => {
  if (state.isCaffeinated) {
    const { powerSaveBlocker } = getElectron();
    state.isCaffeinated = false;
    if (state.powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(state.powerSaveBlockerId);
      state.powerSaveBlockerId = null;
    }
  }
};

/**
 * Update caffeine status based on active sessions
 */
const updateCaffeineStatus = async state => {
  if (!state) {
    return;
  }

  try {
    await cleanupExpiredSessionsWithLock();
    const activeSessions = await getActiveSessionsWithLock();
    const shouldCaffeinate = activeSessions.length > 0;

    if (shouldCaffeinate && !state.isCaffeinated) {
      enableCaffeine(state);
    } else if (!shouldCaffeinate && state.isCaffeinated) {
      disableCaffeine(state);
    }

    updateTrayIcon(state);
  } catch (error) {
    console.error('Error updating caffeine status:', error);
  }
};

/**
 * Start polling for session changes
 */
const startPolling = (state, interval = 10000) => {
  // Initial check
  updateCaffeineStatus(state);

  // Set up periodic polling
  state.pollInterval = setInterval(() => {
    updateCaffeineStatus(state);
  }, interval);
};

/**
 * Stop polling
 */
const stopPolling = state => {
  if (state && state.pollInterval) {
    try {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    } catch (error) {
      console.error('Error clearing interval:', error.message);
    }
  }
};

/**
 * Shutdown server and clean up resources
 */
const shutdownServer = async state => {
  console.error('Shutting down caffeine server...');

  if (!state) {
    console.error('No state provided, exiting...');
    return;
  }

  // Stop polling
  stopPolling(state);

  // Always disable caffeine before shutting down
  try {
    disableCaffeine(state);
  } catch (error) {
    console.error('Error disabling caffeine:', error.message);
  }

  // Clean up Electron system tray
  try {
    if (state.tray) {
      state.tray.destroy();
      state.tray = null;
    }
  } catch (error) {
    console.error('Error destroying Electron system tray:', error.message);
  }

  // Remove PID file
  try {
    await removePidFileWithLock();
  } catch (error) {
    console.error('Error removing PID file:', error.message);
  }

  // Reset global state
  trayState = null;
};

module.exports = {
  createIcon,
  createSystemTray,
  getSystemTray,
  getSystemTrayState,
  updateTrayIcon,
  enableCaffeine,
  disableCaffeine,
  updateCaffeineStatus,
  startPolling,
  stopPolling,
  shutdownServer
};
