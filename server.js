import express from "express";
import cors from "cors";
import { spawn } from "child_process";

const app = express();

app.use(cors({
  origin: "*"
}));

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
    res.json({ url: audioUrl.trim() });
  });

});

app.get("/resolve", async (req, res) => {

  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  const url = `https://youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio[ext=m4a]/bestaudio",
    "-g",
    "--no-check-certificates",
    "--force-ipv4",
    "--geo-bypass",
    "--extractor-args",
    "youtube:player_client=android,player_skip=configs",
    "--add-header",
    "User-Agent:com.google.android.youtube/19.09.37 (Linux; U; Android 13)",
    url
  ]);

  let audioUrl = "";
  let err = "";

  ytdlp.stdout.on("data", (d) => {
    audioUrl += d.toString();
  });

  ytdlp.stderr.on("data", (e) => {
    err += e.toString();
  });

  ytdlp.on("close", () => {

    if (!audioUrl.trim()) {
      console.log("yt-dlp ERROR:", err);
      return res.status(500).json({ error: err });
    }

    res.json({
      url: audioUrl.trim()
    });

  });

});


app.listen(10000, () => {
  console.log("Audio proxy running...");
});
