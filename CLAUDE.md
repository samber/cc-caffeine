# CC-Caffeine: Claude Code Sleep Prevention System

A Node.js/Electron script that prevents your computer from going to sleep while using Claude Code through system tray integration and session management.

## Architecture

The system consists of a modular architecture with the following components:

### Core Modules

1. **caffeine.js** - Main entry point that orchestrates all modules and handles command routing
2. **src/commands.js** - Handles command-line interface functionality and process management
3. **src/session.js** - Manages session persistence with file locking and timeout handling
4. **src/server.js** - Handles server process management and Electron integration
5. **src/system-tray.js** - Manages system tray functionality and sleep prevention
6. **src/electron.js** - Wraps Electron-specific functionality and provides cross-platform support
7. **src/config.js** - Reads user configuration from `~/.claude/plugins/cc-caffeine/config.json`

### User Commands

1. **caffeinate command** - Adds session to JSON file and ensures server is running
2. **uncaffeinate command** - Removes session from JSON file
3. **server command** - Starts Electron system tray application that polls JSON file for active sessions
4. **version command** - Shows version information from package.json and plugin.json

## Features

- Cross-platform support (Linux, macOS, Windows)
- Headless Electron system tray (no windows, only system tray)
- JSON file for session persistence with proper-lockfile for concurrency
- Configurable session timeout (default: 15 minutes of inactivity)
- Auto-server startup when not running
- Multiple concurrent session support
- Real-time status monitoring
- Lightweight client commands (no Electron dependency for caffeinate/uncaffeinate)
- Native sleep prevention using Electron's powerSaveBlocker API
- Hidden from macOS dock using app.dock.hide()

## Configuration

User configuration is stored at `~/.claude/plugins/cc-caffeine/config.json`. All settings are optional and have sensible defaults.

```json
{
  "session_timeout_minutes": 15,
  "icon_theme": "orange"
}
```

### Options

| Setting | Default | Description |
|---------|---------|-------------|
| `session_timeout_minutes` | `15` | Minutes of inactivity before a session expires |
| `icon_theme` | `"orange"` | Tray icon theme: `"orange"` (colored) or `"monochrome"` (black/white, auto-adapts to macOS dark mode) |

## Technical Stack

- **Node.js 14+** - Runtime environment with modern JavaScript features
- **Electron 28+** - Cross-platform desktop application framework
- **proper-lockfile** - File locking for all concurrent access with retry logic
- **Electron powerSaveBlocker** - Native cross-platform sleep prevention
- **Electron Tray/Menu** - System tray functionality
- **JSON file** - Session storage and communication
- **setInterval** - Background polling for session changes

## Commands Usage

### caffeinate
Enables sleep prevention for the current session (lightweight, no system tray).
```bash
node caffeine.js caffeinate
# or
npm run caffeinate
```
Accepts JSON via stdin with session_id:
```json
{"session_id": "abc123"}
```

### uncaffeinate
Disables sleep prevention for the current session (lightweight, no system tray).
```bash
node caffeine.js uncaffeinate
# or
npm run uncaffeinate
```
Accepts JSON via stdin with session_id:
```json
{"session_id": "abc123"}
```

### server
Starts the headless Electron caffeine server with system tray only.
```bash
node caffeine.js server
# or
npm run server
# or
npm start
```

**Cross-platform background operation:**
```bash
npm run server  # Completely headless - no windows, only system tray
```

### version
Shows version information from both package.json and .claude-plugin/plugin.json.
```bash
node caffeine.js version
# or
npm run version
```

Output example:
```
=== CC-Caffeine Version ===
Package version: 0.1.1
Plugin version:  0.1.1
```

## Installation & Setup

1. Install Node.js dependencies:
```bash
npm install
```

2. Create config directory:
```bash
mkdir -p ~/.claude/plugins/cc-caffeine
```

3. Make the script executable (optional):
```bash
chmod +x caffeine.js
```

4. Configure Claude Code hooks (example):
```json
{
  "hooks": {
     "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/caffeine.js caffeinate"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/caffeine.js uncaffeinate"
          }
        ]
      }
    ]
  }
}
```

Note: The server will be auto-started by the caffeinate command when needed.

## JSON File Structure

JSON file located at: `~/.claude/plugins/cc-caffeine/sessions.json`

```json
{
  "sessions": {
    "session_id_abc123": {
      "created_at": "2025-01-08T10:30:00.000Z",
      "last_activity": "2025-01-08T10:45:00.000Z"
    }
  },
  "last_updated": "2025-01-08T10:45:00.000Z"
}
```

Sessions are removed automatically after 15 minutes of inactivity.

## File Concurrency

- **proper-lockfile** ensures atomic read/write operations
- File locking prevents corruption when multiple processes access simultaneously
- Short lock duration - Lock only held during actual read/write operations
- Built-in retry mechanism with configurable timeout
- Cross-platform file locking using OS primitives
- Atomic session operations (add/remove) within single lock to prevent race conditions

## Session Management

- Sessions auto-expire after the configured timeout (default: 15 minutes of inactivity)
- Automatic cleanup of expired sessions during every add/remove operation
- Server polls JSON file every 10 seconds for active sessions (with file locking)
- Multiple sessions can be active simultaneously
- Sleep prevention is active when at least one session is active
- Commands auto-start server if not running
- Only server command loads Electron system tray (lightweight client commands)
- All session operations are atomic within file locks to prevent corruption
- Session timestamps: `created_at` preserved, `last_activity` updated on subsequent calls
- All JSON file operations (read/write) are protected with proper-lockfile
- Client commands (caffeinate/uncaffeinate) work without Electron dependency

## System Tray

- Headless Electron application - no windows ever created
- Shows custom icon when caffeinated/inactive
- Context menu with Exit button
- Hidden from macOS dock using `app.dock.hide()`
- Cross-platform system tray support

## Running Without Console Window

The Electron server is completely headless:

```bash
# Start headless server (no windows, only system tray)
npm run server
# or
npm start
```

### Platform-Specific Background Operation:

**macOS:**
- Hidden from dock using `app.dock.hide()`
- System tray only operation
- Native sleep prevention

**Windows/Linux:**
- Background process with system tray
- No console windows created
- Native sleep prevention

## Development Scripts

Additional npm scripts for development:

```bash
npm run version   # Show version information from package.json and plugin.json
npm run lint      # Run ESLint (if installed)
npm run format    # Format code with Prettier (if installed)
```

## Module Import Structure

The application uses CommonJS modules with clear dependency hierarchy:

- `caffeine.js` imports from `src/commands.js` and `src/server.js`
- `src/commands.js` imports from `src/session.js` and `src/config.js`
- `src/server.js` imports from `src/session.js`, `src/system-tray.js`, and `src/electron.js`
- `src/system-tray.js` imports from `src/session.js`, `src/electron.js`, and `src/config.js`
- `src/session.js` imports from `src/config.js`
- `src/config.js` reads `~/.claude/plugins/cc-caffeine/config.json`
- `src/electron.js` provides Electron functionality on-demand

## Sleep Prevention

- Uses **Electron's powerSaveBlocker** for cross-platform sleep prevention
- `powerSaveBlocker.start('prevent-app-suspension')` blocks system sleep and app suspension
- Automatically activates when sessions are active
- Gracefully releases sleep prevention on shutdown
- Works on Windows, macOS, and Linux

## File Structure

```
caffeine.js          - Main entry point and command routing
src/
└── commands.js          - Command-line interface and process management
└── session.js           - Session persistence and file locking
└── server.js            - Server process management and Electron integration
└── system-tray.js       - System tray functionality and sleep prevention
└── electron.js          - Electron-specific functionality wrapper
└── config.js            - User configuration reader
package.json         - Node.js dependencies and scripts
icon-coffee-full.png - Active caffeine icon (PNG)
icon-coffee-empty.png- Inactive caffeine icon (PNG)
icon-coffee-full.svg - Active caffeine icon (SVG)
icon-coffee-empty.svg- Inactive caffeine icon (SVG)
icon-coffee-full-mono.png - Active caffeine icon monochrome (PNG)
icon-coffee-empty-mono.png- Inactive caffeine icon monochrome (PNG)
icon-coffee-full-mono.svg - Active caffeine icon monochrome (SVG)
icon-coffee-empty-mono.svg- Inactive caffeine icon monochrome (SVG)
~/.claude/plugins/cc-caffeine/
└── sessions.json    - JSON file with session data
└── config.json      - User configuration (optional)
```

**Modular architecture benefits:**
- Separation of concerns for better maintainability
- Individual modules can be tested independently
- Clear separation between Electron-dependent and lightweight client code
- Easier to extend and modify specific functionality
- Better code organization and readability

## Error Handling

- Graceful server startup fallback if Electron unavailable
- JSON file read/write error recovery with proper-lockfile
- All operations protected by file locks to prevent race conditions
- Atomic session operations prevent data corruption during concurrent access
- Session cleanup on process termination
- Cross-platform path handling using Node.js path module
- Lock timeout handling with proper error messages
- Automatic expired session cleanup during every operation
- Proper powerSaveBlocker cleanup on server shutdown
- Graceful error handling for missing Electron APIs

## Cross-platform

- Native MacOS/Windows/Linxe sleep prevention via Electron
- Compatible with OS security permissions and system tray
- Background process

## Security Considerations

- Session validation and timeout protection
- No external network connections required
- File access restricted to user's home directory
- Process isolation between client commands and Electron server

## Performance Considerations

- Minimal memory footprint
- Efficient polling with 5-second intervals
- Fast startup time (< 1 seconds for Electron)
