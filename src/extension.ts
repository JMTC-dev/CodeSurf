import * as vscode from "vscode";
import { StatsTracker } from "./stats";

let videoPanel: vscode.WebviewPanel | undefined;
let isVideoPlaying = false;
let lastEditTimestamp = 0;
let generationDetectionInterval: NodeJS.Timeout | undefined;
let recentFileChanges = new Map<string, number>();
let statsTracker: StatsTracker;
let currentLineCount = 0;
let videoPaused = false;
let hideTimeout: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log("codesurfers extension activated");

  // Initialize stats tracker
  statsTracker = new StatsTracker(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("codesurfers.toggleVideo", () => {
      toggleVideoPanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codesurfers.setVideoUrl", async () => {
      const url = await vscode.window.showInputBox({
        prompt:
          "Enter YouTube embed URL (e.g., https://www.youtube.com/embed/VIDEO_ID)",
        value: vscode.workspace
          .getConfiguration("codesurfers")
          .get("videoUrl") as string,
      });

      if (url) {
        await vscode.workspace
          .getConfiguration("codesurfers")
          .update("videoUrl", url, true);
        if (videoPanel) {
          updateVideoUrl(url);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codesurfers.showStats", () => {
      vscode.window.showInformationMessage(statsTracker.getFormattedStats(), {
        modal: true,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codesurfers.resetStats", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Reset all codesurfers statistics?",
        "Yes",
        "No"
      );
      if (confirm === "Yes") {
        statsTracker.reset();
        vscode.window.showInformationMessage("Statistics reset!");
      }
    })
  );

  // Monitor for code generation
  startCodeGenerationDetection(context);

  // Pause on focus if configured
  if (vscode.workspace.getConfiguration("codesurfers").get("pauseOnFocus")) {
    context.subscriptions.push(
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused && isVideoPlaying) {
          pauseVideo();
        }
      })
    );
  }
}

function detectLargeBlockChanges(
  event: vscode.TextDocumentChangeEvent
): boolean {
  for (const change of event.contentChanges) {
    const addedLines = change.text.split("\n").length;
    const charactersAdded = change.text.length;

    // If more than 3 lines or 150 characters added at once, likely AI generation
    if (addedLines > 3 || charactersAdded > 150) {
      return true;
    }
  }
  return false;
}

function detectAIPatterns(event: vscode.TextDocumentChangeEvent): boolean {
  for (const change of event.contentChanges) {
    const text = change.text;

    // Common patterns in AI-generated code
    const patterns = [
      /function\s+\w+\s*\([^)]*\)\s*{/, // Function declarations
      /const\s+\w+\s*=\s*\([^)]*\)\s*=>/, // Arrow functions
      /class\s+\w+\s*(extends\s+\w+)?\s*{/, // Class declarations
      /\/\*\*[\s\S]+?\*\//, // JSDoc comments
      /import\s+.+\s+from\s+['"][^'"]+['"]/, // Import statements
      /export\s+(default\s+)?/, // Export statements
    ];

    // If the change contains structured code patterns, more likely to be AI
    const matchCount = patterns.filter((pattern) => pattern.test(text)).length;
    return matchCount >= 2;
  }
  return false;
}

function startCodeGenerationDetection(context: vscode.ExtensionContext) {
  // Monitor text document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const now = Date.now();
      const config = vscode.workspace.getConfiguration("codesurfers");
      const sensitivity = config.get("detectionSensitivity", 100);

      // Track file changes for multi-file detection
      const fileName = event.document.fileName;
      recentFileChanges.set(fileName, now);

      // Check if changes are happening rapidly (indicating generation)
      if (event.contentChanges.length > 0) {
        const timeSinceLastEdit = now - lastEditTimestamp;

        // Multiple detection methods
        const isRapidEdit =
          timeSinceLastEdit < sensitivity && timeSinceLastEdit > 0;
        const isLargeBlock = detectLargeBlockChanges(event);
        const hasAIPatterns = detectAIPatterns(event);

        // Check for clipboard paste (common with AI tools)
        let isClipboardPaste = false;
        try {
          const clipboardText = await vscode.env.clipboard.readText();
          isClipboardPaste = event.contentChanges.some(
            (change) =>
              clipboardText.includes(change.text) && change.text.length > 50
          );
        } catch (e) {
          // Clipboard access might fail
        }

        // Trigger if any detection method is positive
        if (
          (isRapidEdit || isLargeBlock || hasAIPatterns || isClipboardPaste) &&
          !isVideoPlaying &&
          config.get("autoPlay")
        ) {
          // Clear any pending hide timeout
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = undefined;
          }

          startVideo(context);
        } else if (
          isVideoPlaying &&
          (isRapidEdit || isLargeBlock || hasAIPatterns || isClipboardPaste)
        ) {
          // If video is playing and we detect more generation, reset the pause timer
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = undefined;
          }
        }

        lastEditTimestamp = now;
      }
    })
  );

  // Monitor diagnostics changes (rapid diagnostics often indicate new code)
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((event) => {
      // Large numbers of diagnostic changes can indicate AI-generated code
      if (event.uris.length > 3 && !isVideoPlaying) {
        const config = vscode.workspace.getConfiguration("codesurfers");
        if (config.get("autoPlay")) {
          startVideo(context);
        }
      }
    })
  );

  // Check periodically if edits have stopped
  generationDetectionInterval = setInterval(() => {
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditTimestamp;
    const config = vscode.workspace.getConfiguration("codesurfers");

    // Clean up old file change entries
    for (const [file, timestamp] of recentFileChanges) {
      if (now - timestamp > 10000) {
        recentFileChanges.delete(file);
      }
    }

    // Only check for pause/hide if video is actually playing and no timeout is already set
    if (isVideoPlaying && !hideTimeout) {
      const hideDelay = config.get("hideDelay", 4000);
      if (timeSinceLastEdit > hideDelay) {
        // Set a timeout instead of immediately pausing
        hideTimeout = setTimeout(() => {
          if (config.get("autoHide")) {
            hideVideoPanel();
          } else {
            pauseVideo();
          }
          hideTimeout = undefined;
        }, 1000);
      }
    }
  }, 1000);
}

function toggleVideoPanel(context: vscode.ExtensionContext) {
  if (videoPanel) {
    videoPanel.dispose();
    videoPanel = undefined;
    isVideoPlaying = false;
  } else {
    createVideoPanel(context);
  }
}

function createVideoPanel(context: vscode.ExtensionContext) {
  // If we're recreating the panel and video was paused, restore that state
  const wasVideoPaused = videoPaused;

  // Get configured panel column
  const config = vscode.workspace.getConfiguration("codesurfers");
  const panelColumn = config.get("panelColumn", "beside") as string;

  let viewColumn: vscode.ViewColumn;
  switch (panelColumn) {
    case "active":
      viewColumn = vscode.ViewColumn.Active;
      break;
    case "beside":
      viewColumn = vscode.ViewColumn.Beside;
      break;
    case "one":
      viewColumn = vscode.ViewColumn.One;
      break;
    case "two":
      viewColumn = vscode.ViewColumn.Two;
      break;
    case "three":
      viewColumn = vscode.ViewColumn.Three;
      break;
    case "four":
      viewColumn = vscode.ViewColumn.Four;
      break;
    case "five":
      viewColumn = vscode.ViewColumn.Five;
      break;
    case "six":
      viewColumn = vscode.ViewColumn.Six;
      break;
    case "seven":
      viewColumn = vscode.ViewColumn.Seven;
      break;
    case "eight":
      viewColumn = vscode.ViewColumn.Eight;
      break;
    case "nine":
      viewColumn = vscode.ViewColumn.Nine;
      break;
    default:
      viewColumn = vscode.ViewColumn.Beside;
  }

  videoPanel = vscode.window.createWebviewPanel(
    "codesurfers",
    "codesurfers",
    viewColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const videoUrl = vscode.workspace
    .getConfiguration("codesurfers")
    .get("videoUrl") as string;
  videoPanel.webview.html = getWebviewContent(videoUrl);

  videoPanel.onDidDispose(
    () => {
      videoPanel = undefined;
      isVideoPlaying = false;
    },
    null,
    context.subscriptions
  );

  // If video was previously paused, don't auto-play
  if (wasVideoPaused) {
    videoPaused = false;
  }
}

function getWebviewContent(videoUrl: string): string {
  // Extract video ID if full YouTube URL is provided
  let embedUrl = videoUrl;
  if (videoUrl.includes("youtube.com/watch")) {
    const videoId = videoUrl.split("v=")[1]?.split("&")[0];
    embedUrl = `https://www.youtube.com/embed/${videoId}`;
  }

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>codesurfers</title>
        <style>
            html, body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100vh;
                overflow: hidden;
                background: #000;
            }
            .video-wrapper {
                position: relative;
                width: 100%;
                height: 100%;
            }
            #player {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border: none;
            }
            .controls {
                position: absolute;
                bottom: 20px;
                right: 20px;
                opacity: 0.8;
                transition: opacity 0.3s;
                z-index: 10;
            }
            .controls:hover {
                opacity: 1;
            }
            .control-btn {
                background: rgba(0, 0, 0, 0.8);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.3);
                padding: 8px 12px;
                margin: 0 4px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 16px;
                transition: all 0.2s;
            }
            .control-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                border-color: rgba(255, 255, 255, 0.5);
            }
        </style>
    </head>
    <body>
        <div class="video-wrapper">
            <iframe 
                id="player"
                src="${embedUrl}?autoplay=1&mute=1&controls=1&loop=1&playlist=${embedUrl
    .split("/")
    .pop()}&enablejsapi=1&start=0&modestbranding=1&rel=0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowfullscreen>
            </iframe>
            <div class="controls">
                <button class="control-btn" onclick="toggleMute()" title="Toggle Mute">🔇</button>
                <button class="control-btn" onclick="toggleFullscreen()" title="Fullscreen">⛶</button>
            </div>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            const player = document.getElementById('player');
            let isMuted = true;
            let currentTime = 0;
            let checkTimeInterval;
            
            // Store current time periodically
            function startTimeTracking() {
                checkTimeInterval = setInterval(() => {
                    try {
                        player.contentWindow.postMessage('{"event":"listening","id":1,"channel":"widget"}', '*');
                    } catch (e) {}
                }, 1000);
            }
            
            // Listen for YouTube player messages
            window.addEventListener('message', (event) => {
                if (event.origin !== 'https://www.youtube.com') return;
                
                try {
                    const data = JSON.parse(event.data);
                    if (data.event === 'infoDelivery' && data.info && data.info.currentTime) {
                        currentTime = data.info.currentTime;
                        vscode.postMessage({ command: 'updateTime', time: currentTime });
                    }
                } catch (e) {}
            });
            
            function toggleMute() {
                isMuted = !isMuted;
                const muteCmd = isMuted ? 'mute' : 'unMute';
                player.contentWindow.postMessage('{"event":"command","func":"' + muteCmd + '","args":""}', '*');
                document.querySelector('.control-btn').textContent = isMuted ? '🔇' : '🔊';
            }
            
            function toggleFullscreen() {
                if (player.requestFullscreen) {
                    player.requestFullscreen();
                } else if (player.webkitRequestFullscreen) {
                    player.webkitRequestFullscreen();
                } else if (player.mozRequestFullScreen) {
                    player.mozRequestFullScreen();
                }
            }
            
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'play':
                        player.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                        startTimeTracking();
                        break;
                    case 'pause':
                        player.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                        if (checkTimeInterval) {
                            clearInterval(checkTimeInterval);
                        }
                        break;
                    case 'updateUrl':
                        const startTime = message.startTime || 0;
                        player.src = message.url + '?autoplay=1&mute=1&controls=1&loop=1&playlist=' + 
                                   message.url.split('/').pop() + '&enablejsapi=1&start=' + Math.floor(startTime) +
                                   '&modestbranding=1&rel=0';
                        break;
                    case 'seekTo':
                        player.contentWindow.postMessage('{"event":"command","func":"seekTo","args":[' + message.time + ', true]}', '*');
                        break;
                }
            });
            
            // Ensure video starts playing when iframe loads
            player.addEventListener('load', () => {
                setTimeout(() => {
                    player.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                    startTimeTracking();
                }, 1000);
            });
        </script>
    </body>
    </html>`;
}

function startVideo(context: vscode.ExtensionContext) {
  if (!videoPanel) {
    createVideoPanel(context);
    // Small delay to ensure the panel is ready
    setTimeout(() => {
      videoPanel?.webview.postMessage({ command: "play" });
    }, 500);
  } else {
    videoPanel?.webview.postMessage({ command: "play" });
  }

  isVideoPlaying = true;
  videoPaused = false;

  // Track stats
  const editor = vscode.window.activeTextEditor;
  currentLineCount = editor ? editor.document.lineCount : 0;
  const videoUrl = vscode.workspace
    .getConfiguration("codesurfers")
    .get("videoUrl") as string;
  statsTracker.startSession(videoUrl, currentLineCount);
}

function pauseVideo() {
  videoPanel?.webview.postMessage({ command: "pause" });
  isVideoPlaying = false;
  videoPaused = true;

  // End stats session
  const editor = vscode.window.activeTextEditor;
  currentLineCount = editor ? editor.document.lineCount : 0;
  statsTracker.endSession(currentLineCount);
}

function hideVideoPanel() {
  // First pause the video to maintain position
  pauseVideo();

  // Then hide the panel
  if (videoPanel) {
    videoPanel.dispose();
    videoPanel = undefined;
  }
}

function updateVideoUrl(url: string) {
  videoPanel?.webview.postMessage({ command: "updateUrl", url: url });
}

export function deactivate() {
  if (generationDetectionInterval) {
    clearInterval(generationDetectionInterval);
  }
  if (videoPanel) {
    videoPanel.dispose();
  }
}
