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
    "-g",
    url
  ]);

  let audioUrl = "";

  ytdlp.stdout.on("data", (data) => {
    audioUrl += data.toString();
  });

  ytdlp.on("close", () => {
    audioUrl = audioUrl.trim();
    res.redirect(audioUrl);
  });

});

app.listen(10000, () => {
  console.log("Audio proxy running...");
});
