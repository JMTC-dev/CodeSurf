# codesurfers - Subway Surfer for Code Generation

Play Subway Surfer clips while Cursor/VS Code generates code! Because who said coding can't be entertaining?

## Features

- 🎮 **Automatic video playback** when code generation is detected
- 🎬 Customizable YouTube video URL
- ⏯️ Manual toggle control via command palette or keyboard shortcut
- 🔄 Auto-pause when generation stops (with smart detection to avoid false pauses)
- 🫥 **Auto-hide mode** - Video disappears when not needed, preserving playback position
- 📊 **Statistics tracking** - See your coding stats with style
- 🔇 **Mute/unmute controls** - Start muted for autoplay compatibility
- ⛶ **Fullscreen support** - Watch in fullscreen mode
- 📍 **Flexible positioning** - Place video panel in any editor column
- ⌨️ **Keyboard shortcuts** - Quick toggle with Ctrl+Shift+S

## How It Works

The extension uses multiple detection methods to identify when AI is generating code:

1. Opens a video panel (muted by default for autoplay)
2. Plays your configured YouTube video automatically
3. Keeps playing for 4-5 seconds after generation stops before pausing
4. Tracks statistics about your coding sessions
5. Remembers video position when hidden and resumes from the same spot

## Installation

### From Source (Development)

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` in VS Code to launch a new Extension Development Host

### Building the Extension

To create a `.vsix` file for distribution:

```bash
npm run package
```

This will create a `codesurfers-1.0.0.vsix` file that can be installed in VS Code/Cursor.

## Usage

### Commands

- **codesurfers: Toggle Subway Surfer Video** - Show/hide the video panel (Ctrl+Shift+S)
- **codesurfers: Set YouTube Video URL** - Change the video URL
- **codesurfers: Show Statistics** - View your codesurfers stats
- **codesurfers: Reset Statistics** - Clear all statistics

### Video Controls

When the video panel is open:

- 🔇/🔊 **Mute/Unmute button** - Toggle sound
- ⛶ **Fullscreen button** - Enter fullscreen mode

### Configuration

Configure the extension in VS Code settings:

- `codesurfers.videoUrl`: YouTube embed URL to play (default: a classic)
- `codesurfers.autoPlay`: Automatically play when code generation starts (default: true)
- `codesurfers.detectionSensitivity`: Milliseconds between edits to trigger video (default: 100, range: 50-500)
- `codesurfers.videoPosition`: Position of video panel (default: "sidebar", options: "sidebar", "bottom-right", "top-right", "bottom-left", "top-left")
- `codesurfers.videoOpacity`: Opacity of the video panel (default: 1.0, range: 0.3-1.0)
- `codesurfers.pauseOnFocus`: Pause video when editor gains focus (default: false)
- `codesurfers.soundEnabled`: Enable sound by default (default: false, requires user interaction)
- **`codesurfers.autoHide`**: Automatically hide video panel when generation stops (default: false)
- **`codesurfers.hideDelay`**: Milliseconds to wait before hiding (default: 4000, range: 500-10000)
  - The video will keep playing for 4-5 seconds after code generation stops
- **`codesurfers.panelColumn`**: Which editor column to show the video in (default: "beside")
  - Options: "active", "beside", "one", "two", "three", etc. up to "nine"

### Setting a Custom Video

1. Find a YouTube video you want to use
2. Get the video ID from the URL (e.g., `dQw4w9WgXcQ` from `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
3. Use the command "codesurfers: Set YouTube Video URL"
4. Enter the embed URL: `https://www.youtube.com/embed/VIDEO_ID`

## Statistics Tracking

codesurfers tracks fun statistics about your coding sessions:

- Total generation time with videos
- Number of coding sessions
- Average session length
- Longest coding streak
- Lines of code generated
- Favorite video (most played)

View your stats with the "codesurfers: Show Statistics" command!

## Detection Mechanism

The extension uses multiple methods to detect AI code generation:

### 1. **Rapid Edit Detection**

- Monitors time between text changes
- Triggers when edits happen faster than the configured sensitivity (default: 100ms)

### 2. **Large Block Detection**

- Detects when large chunks of code appear at once
- Triggers on additions of 3+ lines or 150+ characters in a single edit

### 3. **AI Pattern Recognition**

- Looks for common patterns in AI-generated code:
  - Complete function declarations
  - Class definitions
  - Import/export statements
  - JSDoc comments
  - Multiple structured code patterns appearing together

### 4. **Clipboard Monitoring**

- Detects when pasted content matches recent clipboard contents
- Many AI tools copy code to clipboard before insertion

### 5. **Diagnostic Changes**

- Monitors Language Server Protocol diagnostics
- Large numbers of simultaneous diagnostic changes often indicate new AI-generated code

The extension combines all these methods for robust detection. It starts playing when any method triggers and stops after 2 seconds of inactivity.

## Development

### Project Structure

```
codesurfers/
├── src/
│   ├── extension.ts    # Main extension code
│   └── stats.ts        # Statistics tracking
├── package.json        # Extension manifest
├── tsconfig.json       # TypeScript configuration
└── README.md          # This file
```

### Building and Testing

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package
```

## Known Limitations

- Detection is heuristic-based and might not catch all generation events
- YouTube iframe API has limitations for video control
- Some videos might not allow embedding
- Cursor-specific AI features cannot be directly hooked into
- Autoplay requires videos to start muted due to browser policies

## Contributing

Feel free to submit issues and enhancement requests!

## License

ISC

## Troubleshooting

### Video keeps pausing unexpectedly

- Increase `codesurfers.hideDelay` to wait longer before pausing
- Disable `codesurfers.pauseOnFocus` if you switch between windows often
- The extension now has smarter pause detection that resets when it detects ongoing generation

### Video is too small

- Use the fullscreen button (⛶) for a bigger view
- Change `codesurfers.panelColumn` to place the video in a larger column
- The video now fills the entire panel for better viewing
