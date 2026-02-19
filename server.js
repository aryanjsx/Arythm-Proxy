const express = require("express");
const { spawn } = require("child_process");

const app = express();

app.get("/audio", (req, res) => {

  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  const url = `https://youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio[ext=m4a]/bestaudio",
    "-o",
    "-",
    "--no-playlist",
    url
  ]);

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");

  ytdlp.stdout.pipe(res);

  ytdlp.stderr.on("data", d =>
    console.log("yt-dlp:", d.toString())
  );

});

app.listen(10000, () => {
  console.log("Audio proxy running...");
});
