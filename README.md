# Arythm Audio Proxy

A lightweight yt-dlp audio streaming proxy for [Arythm](https://github.com/YOUR_USERNAME/Song-Tunes). Designed to run on Render as a Docker Web Service.

## API

### `GET /audio?v=VIDEO_ID`

Streams the best available audio for the given YouTube video ID as `audio/mp4`.

### `GET /health`

Returns `{ "status": "ok" }` — useful for Render health checks.

## Deploy to Render

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Environment**: Docker
   - **Plan**: Free (or Starter for better uptime)
5. Deploy

Once deployed, copy the URL (e.g. `https://arythm-audio-proxy.onrender.com`) and set it as `AUDIO_PROXY_URL` in your Arythm frontend environment variables.

## Local Development

```bash
# Requires yt-dlp and ffmpeg installed locally
npm install
npm start
# Server runs on http://localhost:3001
```
