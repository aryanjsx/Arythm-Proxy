const express = require("express");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/audio", (req, res) => {
  const videoId = req.query.v;

  if (!videoId || typeof videoId !== "string") {
    return res.status(400).json({ error: "Missing video ID" });
  }

  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, "");
  const url = `https://music.youtube.com/watch?v=${sanitized}`;

  const ytdlp = spawn("yt-dlp", [
    "-f", "bestaudio[ext=m4a]/bestaudio",
    "--no-playlist",
    "--no-warnings",
    "-o", "-",
    url,
  ]);

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-store");

  ytdlp.stdout.pipe(res);

  ytdlp.stderr.on("data", (chunk) => {
    console.error("[yt-dlp]", chunk.toString().trim());
  });

  ytdlp.on("error", (err) => {
    console.error("[yt-dlp] spawn error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp failed to start" });
    }
  });

  ytdlp.on("close", (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(500).json({ error: `yt-dlp exited with code ${code}` });
    }
  });

  req.on("close", () => {
    ytdlp.kill("SIGTERM");
  });
});

app.listen(PORT, () => {
  console.log(`Audio proxy running on port ${PORT}`);
});
