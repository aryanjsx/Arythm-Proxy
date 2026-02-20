import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { Readable } from "stream";

const app = express();

app.use(cors({
  origin: "*"
}));

const urlCache = new Map();
const inflight = new Map();
const URL_TTL = 5 * 60 * 60 * 1000;

function resolveAudioUrl(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(cached.url);
  }

  if (inflight.has(videoId)) {
    return inflight.get(videoId);
  }

  const promise = new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "-g",
      "--no-playlist",
      "--no-warnings",
      "--extractor-retries", "0",
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

  inflight.set(videoId, promise);
  promise.finally(() => inflight.delete(videoId));

  return promise;
}

function pipeUpstream(audioUrl, req, res) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  return fetch(audioUrl, { headers }).then((upstream) => {
    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: "Upstream fetch failed" });
      return false;
    }

    res.status(upstream.status);
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    }
    Readable.fromWeb(upstream.body).pipe(res);
    return true;
  });
}

app.get("/stream", async (req, res) => {
  const videoId = req.query.v;
  const directUrl = req.query.url;

  if (!videoId && !directUrl) return res.sendStatus(400);

  try {
    if (directUrl) {
      const host = new URL(directUrl).hostname;
      if (!host.endsWith(".googlevideo.com") && !host.endsWith(".youtube.com")) {
        return res.status(403).json({ error: "Forbidden host" });
      }
      const ok = await pipeUpstream(directUrl, req, res);
      if (!ok && videoId) {
        const fallbackUrl = await resolveAudioUrl(videoId);
        await pipeUpstream(fallbackUrl, req, res);
      }
      return;
    }

    const audioUrl = await resolveAudioUrl(videoId);
    const ok = await pipeUpstream(audioUrl, req, res);
    if (!ok) {
      urlCache.delete(videoId);
      if (!res.headersSent) res.status(500).json({ error: "Stream failed" });
    }
  } catch (err) {
    if (videoId) urlCache.delete(videoId);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Stream failed" });
  }
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
