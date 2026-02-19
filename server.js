const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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

  const ffmpeg = spawn("ffmpeg", [
    "-f", "webm",
    "-i", "pipe:0",
    "-vn",
    "-acodec", "aac",
    "-b:a", "192k",
    "-f", "mp4",
    "-movflags", "+faststart",
    "pipe:1",
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-store");

  ffmpeg.stdout.pipe(res);

  ytdlp.stderr.on("data", (d) => {
    console.log("ytdlp:", d.toString());
  });

  ffmpeg.stderr.on("data", (d) => {
    console.log("ffmpeg:", d.toString());
  });

  ytdlp.stdout.on("error", () => {});
  ffmpeg.stdin.on("error", () => {});

  ytdlp.on("error", (err) => {
    console.error("[yt-dlp] spawn error:", err.message);
    ffmpeg.kill("SIGTERM");
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp failed to start" });
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("[ffmpeg] spawn error:", err.message);
    ytdlp.kill("SIGTERM");
    if (!res.headersSent) {
      res.status(500).json({ error: "ffmpeg failed to start" });
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`[ffmpeg] exited with code ${code}`);
    if (code !== 0 && !res.headersSent) {
      res.status(500).json({ error: `ffmpeg exited with code ${code}` });
    }
  });

  req.on("close", () => {
    ytdlp.kill("SIGTERM");
    ffmpeg.kill("SIGTERM");
  });
});

app.listen(PORT, () => {
  console.log(`Audio proxy running on port ${PORT}`);
});
