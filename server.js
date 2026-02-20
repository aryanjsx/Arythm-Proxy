import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { Readable } from "stream";

const app = express();

app.use(cors({
  origin: "*"
}));

const urlCache = new Map();
const URL_TTL = 5 * 60 * 60 * 1000; // 5 hours (googlevideo URLs expire in ~6h)

function resolveAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.url);
  }

  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "-g",
      "--cookies", "./cookies.txt",
      "--force-ipv4",
      "--js-runtimes", "node",
      "--geo-bypass",
      `https://youtube.com/watch?v=${videoId}`
    ]);

    let audioUrl = "";
    let err = "";

    ytdlp.stdout.on("data", (d) => { audioUrl += d.toString(); });
    ytdlp.stderr.on("data", (e) => { err += e.toString(); });

    ytdlp.on("close", (code) => {
      audioUrl = audioUrl.trim();
      if (!audioUrl) {
        console.log("yt-dlp ERROR:", err);
        return reject(new Error(err));
      }
      urlCache.set(videoId, { url: audioUrl, expires: Date.now() + URL_TTL });
      resolve(audioUrl);
    });
  });
}

app.get("/stream", async (req, res) => {
  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  try {
    const audioUrl = await resolveAudioUrl(videoId);

    const headers = {};
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstream = await fetch(audioUrl, { headers });

    if (!upstream.ok && upstream.status !== 206) {
      urlCache.delete(videoId);
      return res.status(upstream.status).json({ error: "Upstream fetch failed" });
    }

    res.status(upstream.status);

    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    urlCache.delete(videoId);
    res.status(500).json({ error: err.message || "Stream failed" });
  }

  req.on("close", () => {
    // client disconnected — response stream auto-closes
  });
});

app.get("/resolve", async (req, res) => {
  const videoId = req.query.v;
  if (!videoId) return res.sendStatus(400);

  try {
    const audioUrl = await resolveAudioUrl(videoId);
    res.json({ url: audioUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(10000, () => {
  console.log("Audio proxy running...");
});
