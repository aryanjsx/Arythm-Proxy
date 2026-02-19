const express = require("express");
const { spawn } = require("child_process");

const app = express();

app.get("/audio", (req, res) => {

  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  const url = `https://youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio",
    "-o",
    "-",
    "--no-playlist",
    url
  ]);

  const ffmpeg = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn",
    "-acodec", "aac",
    "-b:a", "192k",
    "-f", "mp4",
    "-movflags", "+faststart",
    "pipe:1"
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");

  ffmpeg.stdout.pipe(res);

});

app.listen(10000, () => {
  console.log("Audio proxy running...");
});
