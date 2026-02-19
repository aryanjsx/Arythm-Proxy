const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3001;
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

function writeCookiesFile() {
  const raw = process.env.YOUTUBE_COOKIE;
  if (!raw) {
    console.warn("[init] YOUTUBE_COOKIE not set — yt-dlp may fail on age-restricted or bot-blocked content");
    return false;
  }

  const lines = ["# Netscape HTTP Cookie File", "# Generated from YOUTUBE_COOKIE env var", ""];

  const pairs = raw.split(";").map((s) => s.trim()).filter(Boolean);
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;

    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    const secure = name.startsWith("__Secure") ? "TRUE" : "FALSE";
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 365;

    lines.push(`.youtube.com\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
  }

  fs.writeFileSync(COOKIES_PATH, lines.join("\n") + "\n");
  console.log(`[init] Wrote ${pairs.length} cookies to ${COOKIES_PATH}`);
  return true;
}

const hasCookies = writeCookiesFile();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", cookies: hasCookies });
});

app.get("/audio", (req, res) => {
  const videoId = req.query.v;

  if (!videoId || typeof videoId !== "string") {
    return res.status(400).json({ error: "Missing video ID" });
  }

  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, "");
  const url = `https://music.youtube.com/watch?v=${sanitized}`;
  const tmpFile = path.join(os.tmpdir(), `arythm-${sanitized}-${Date.now()}.m4a`);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    fs.unlink(tmpFile, () => {});
  }

  const ytArgs = [
    "-f", "bestaudio[ext=m4a]/bestaudio",
    "--no-playlist",
    "-o", "-",
  ];

  if (hasCookies) {
    ytArgs.unshift("--cookies", COOKIES_PATH);
  }

  ytArgs.push(url);

  console.log(`[audio] ${sanitized} — starting yt-dlp`);
  const ytdlp = spawn("yt-dlp", ytArgs);

  // ffmpeg converts DASH/fMP4 → progressive MP4 with moov atom at front
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "info",
    "-i", "pipe:0",
    "-c:a", "aac",
    "-b:a", "192k",
    "-f", "mp4",
    "-movflags", "+faststart",
    "-y",
    tmpFile,
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on("data", (chunk) => {
    console.log(`[yt-dlp] ${chunk.toString().trim()}`);
  });

  ffmpeg.stderr.on("data", (chunk) => {
    console.log(`[ffmpeg] ${chunk.toString().trim()}`);
  });

  ytdlp.stdout.on("error", () => {});
  ffmpeg.stdin.on("error", () => {});

  ytdlp.on("error", (err) => {
    console.error("[yt-dlp] spawn error:", err.message);
    ffmpeg.kill("SIGTERM");
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp failed to start" });
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("[ffmpeg] spawn error:", err.message);
    ytdlp.kill("SIGTERM");
    cleanup();
    if (!res.headersSent) {
      res.status(500).json({ error: "ffmpeg failed to start" });
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`[ffmpeg] exited with code ${code}`);

    if (code !== 0) {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: `ffmpeg exited with code ${code}` });
      }
      return;
    }

    try {
      const stat = fs.statSync(tmpFile);
      console.log(`[audio] ${sanitized} — serving ${stat.size} bytes progressive MP4`);

      res.setHeader("Content-Type", "audio/mp4");
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "no-store");

      const fileStream = fs.createReadStream(tmpFile);
      fileStream.pipe(res);
      fileStream.on("close", cleanup);
      fileStream.on("error", (err) => {
        console.error("[stream] read error:", err.message);
        cleanup();
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream audio file" });
        }
      });
    } catch (err) {
      console.error("[audio] stat/read error:", err.message);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: "Converted file not found" });
      }
    }
  });

  req.on("close", () => {
    ytdlp.kill("SIGTERM");
    ffmpeg.kill("SIGTERM");
    cleanup();
  });
});

app.listen(PORT, () => {
  console.log(`Audio proxy running on port ${PORT}`);
});
