const express = require("express");
const { spawn } = require("child_process");

const app = express();

app.get("/audio", (req, res) => {

  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  const url = `https://youtube.com/watch?v=${videoId}`;

  // Step 1 — yt-dlp gets raw bestaudio
  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio",
    "-o",
    "-",
    "--no-playlist",
    url
  ]);

  // Step 2 — FFmpeg converts DASH → Progressive MP4
  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn",
    "-acodec", "aac",
    "-f", "mp4",
    "-movflags", "frag_keyframe+empty_moov",
    "pipe:1"
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-store");

  ffmpeg.stdout.pipe(res);

});

app.listen(10000, () => {
  console.log("Audio proxy running...");
});
