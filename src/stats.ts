import * as vscode from "vscode";

export interface CodeSurfStats {
  totalGenerationTime: number;
  totalVideoTime: number;
  sessionsCount: number;
  favoriteVideo: string;
  videosWatched: Map<string, number>;
  longestSession: number;
  totalLinesGenerated: number;
}

export class StatsTracker {
  private stats: CodeSurfStats;
  private sessionStartTime: number = 0;
  private currentSessionTime: number = 0;
  private linesAtSessionStart: number = 0;

  constructor(private context: vscode.ExtensionContext) {
    this.stats = this.loadStats();
  }

  private loadStats(): CodeSurfStats {
    const saved = this.context.globalState.get<any>("codesurf.stats");
    if (saved) {
      return {
        ...saved,
        videosWatched: new Map(Object.entries(saved.videosWatched || {})),
      };
    }

    return {
      totalGenerationTime: 0,
      totalVideoTime: 0,
      sessionsCount: 0,
      favoriteVideo: "",
      videosWatched: new Map(),
      longestSession: 0,
      totalLinesGenerated: 0,
    };
  }

  private saveStats() {
    const toSave = {
      ...this.stats,
      videosWatched: Object.fromEntries(this.stats.videosWatched),
    };
    this.context.globalState.update("codesurf.stats", toSave);
  }

  startSession(videoUrl: string, currentLineCount: number) {
    this.sessionStartTime = Date.now();
    this.linesAtSessionStart = currentLineCount;
    this.stats.sessionsCount++;

    // Track video usage
    const count = this.stats.videosWatched.get(videoUrl) || 0;
    this.stats.videosWatched.set(videoUrl, count + 1);

    // Update favorite video
    let maxCount = 0;
    let favorite = "";
    for (const [url, count] of this.stats.videosWatched) {
      if (count > maxCount) {
        maxCount = count;
        favorite = url;
      }
    }
    this.stats.favoriteVideo = favorite;

    this.saveStats();
  }

  endSession(currentLineCount: number) {
    if (this.sessionStartTime === 0) return;

    this.currentSessionTime = Date.now() - this.sessionStartTime;
    this.stats.totalGenerationTime += this.currentSessionTime;
    this.stats.totalVideoTime += this.currentSessionTime;

    if (this.currentSessionTime > this.stats.longestSession) {
      this.stats.longestSession = this.currentSessionTime;
    }

    const linesGenerated = Math.max(
      0,
      currentLineCount - this.linesAtSessionStart
    );
    this.stats.totalLinesGenerated += linesGenerated;

    this.sessionStartTime = 0;
    this.saveStats();
  }

  getStats(): CodeSurfStats {
    return this.stats;
  }

  getFormattedStats(): string {
    const stats = this.stats;
    const formatTime = (ms: number) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    };

    return `🏄 CodeSurf Statistics 🏄
        
Total Generation Time: ${formatTime(stats.totalGenerationTime)}
Total Sessions: ${stats.sessionsCount}
Average Session: ${formatTime(
      stats.totalGenerationTime / Math.max(1, stats.sessionsCount)
    )}
Longest Session: ${formatTime(stats.longestSession)}
Lines Generated: ${stats.totalLinesGenerated}
Videos Watched: ${stats.videosWatched.size}
Favorite Video: ${
      stats.favoriteVideo ? stats.favoriteVideo.split("/").pop() : "None yet"
    }

Keep surfing! 🎮`;
  }

  reset() {
    this.stats = {
      totalGenerationTime: 0,
      totalVideoTime: 0,
      sessionsCount: 0,
      favoriteVideo: "",
      videosWatched: new Map(),
      longestSession: 0,
      totalLinesGenerated: 0,
    };
    this.saveStats();
  }
}
