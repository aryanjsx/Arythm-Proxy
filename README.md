<div align="center">

# Arythm-Proxy

**Audio streaming proxy for [Arythm](https://github.com/aryanjsx/Arythm) -- resolves and streams YouTube audio with CORS support.**

Express · yt-dlp · Docker · Render

</div>

---

## Why Does This Exist?

When Arythm's frontend wants to play a YouTube song, it can't fetch the audio directly from Google's servers (`googlevideo.com`) because those servers don't include `Access-Control-Allow-Origin` headers. The browser blocks the request due to CORS policy.

This proxy sits in the middle:

```
Browser (arythm.vercel.app)
    │
    │  GET /stream?v=VIDEO_ID
    │  (CORS allowed -- proxy sends Access-Control-Allow-Origin: *)
    ▼
Arythm-Proxy (arythm-proxy.onrender.com)
    │
    │  1. Resolve audio URL using yt-dlp
    │  2. Fetch audio bytes from googlevideo.com
    │  3. Pipe them back to the browser
    ▼
Google's Audio Servers (rr2---sn-xxx.googlevideo.com)
```

The proxy also handles:
- **URL caching** -- resolved `googlevideo.com` URLs are cached for 5 hours (they expire in ~6h), so yt-dlp only runs once per song
- **Range header forwarding** -- enables seeking in the audio player
- **YouTube signature solving** -- uses yt-dlp with `yt-dlp-ejs` and Node.js 20+ for JavaScript challenge solving

---

## API Endpoints

### `GET /stream?v=VIDEO_ID`

Streams the audio for a YouTube video. This is what the Arythm frontend uses as the `<audio>` source.

**How it works:**
1. Checks the in-memory URL cache for the video ID
2. On cache miss: spawns `yt-dlp` to get the direct audio URL (format: `bestaudio[ext=m4a]`)
3. Fetches the audio from Google's servers, forwarding the `Range` header from the client
4. Pipes the response back with correct `Content-Type`, `Content-Length`, `Content-Range`, and `Accept-Ranges` headers

**Example:**
```
GET https://arythm-proxy.onrender.com/stream?v=dQw4w9WgXcQ
→ 200 OK (audio/mp4 stream)
```

Supports seeking -- the browser sends `Range: bytes=1000000-` and the proxy forwards it to get a `206 Partial Content` response.

### `GET /resolve?v=VIDEO_ID`

Returns the raw `googlevideo.com` audio URL as JSON. Useful for debugging, but not used by the frontend (since these URLs are blocked by CORS in the browser).

**Example:**
```
GET https://arythm-proxy.onrender.com/resolve?v=dQw4w9WgXcQ
→ { "url": "https://rr2---sn-xxx.googlevideo.com/videoplayback?..." }
```

---

## Deploy to Render

### 1. Push to GitHub

```bash
git clone https://github.com/aryanjsx/Arythm-Proxy.git
cd Arythm-Proxy
git push origin main
```

### 2. Create a Render Web Service

1. Go to [Render Dashboard](https://dashboard.render.com) → **New Web Service**
2. Connect your GitHub repo (`Arythm-Proxy`)
3. Configure:
   - **Environment**: Docker
   - **Region**: closest to your users
   - **Plan**: Free (or Starter for better uptime -- free tier sleeps after 15 min of inactivity)
4. Click **Deploy**

### 3. Connect to Arythm

Copy the Render URL (e.g. `https://arythm-proxy.onrender.com`) and set it in the Arythm frontend's `.env`:

```env
AUDIO_PROXY_URL="https://arythm-proxy.onrender.com"
NEXT_PUBLIC_AUDIO_PROXY_URL="https://arythm-proxy.onrender.com"
```

---

## How It's Built

### Docker Container

The `Dockerfile` sets up a Ubuntu 22.04 container with:

| Component | Version | Purpose |
|:----------|:--------|:--------|
| **Node.js** | 20.x (from NodeSource) | Runs the Express server + acts as yt-dlp's JavaScript runtime |
| **yt-dlp** | Latest (via pip) | Resolves YouTube audio URLs by extracting player signatures |
| **yt-dlp-ejs** | Latest (via pip) | External JavaScript solver scripts for YouTube's signature challenges |
| **ffmpeg** | System package | Required by yt-dlp for some audio format operations |
| **Express** | 4.x | HTTP server with CORS middleware |

### Key Design Decisions

**Why yt-dlp instead of youtubei.js?** YouTube's audio URLs require solving a JavaScript signature challenge. `yt-dlp` with `yt-dlp-ejs` handles this reliably, including keeping up with YouTube's frequent changes to their obfuscation.

**Why cache URLs for 5 hours?** Google's `googlevideo.com` URLs expire after roughly 6 hours. Caching for 5 hours means yt-dlp (which takes 2-5 seconds) only runs once per song. Subsequent requests (including seeks) hit the cache and stream instantly.

**Why pipe instead of redirect?** A simple redirect to the `googlevideo.com` URL would be faster, but the browser would hit CORS again. The proxy must fetch and pipe the bytes itself so it can attach CORS headers.

---

## Local Development

### Prerequisites

- **Node.js** 20+
- **yt-dlp** installed globally (`pip install yt-dlp yt-dlp-ejs`)
- **ffmpeg** installed

### Run

```bash
npm install
npm start
```

The server starts on **http://localhost:10000**.

Test it:
```bash
curl "http://localhost:10000/resolve?v=dQw4w9WgXcQ"
```

### Optional: cookies.txt

If you need to access age-restricted or region-locked content, place a `cookies.txt` file (Netscape format) in the project root. You can export it from your browser using extensions like [Get cookies.txt](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc).

---

## Troubleshooting

| Symptom | Cause | Fix |
|:--------|:------|:----|
| `Signature solving failed` | yt-dlp can't run JavaScript challenges | Ensure Node.js 20+ is installed and `yt-dlp-ejs` is installed via pip |
| `Requested format is not available` | yt-dlp is outdated | Run `pip install -U yt-dlp yt-dlp-ejs` inside the container |
| CORS errors in browser | Frontend is fetching `googlevideo.com` directly instead of going through `/stream` | Make sure `NEXT_PUBLIC_AUDIO_PROXY_URL` is set and the frontend uses `/stream` |
| Slow first play (3-5s delay) | yt-dlp resolving the URL for the first time | Normal -- subsequent plays of the same song are instant (cached for 5h) |
| `502 Bad Gateway` on Render | Container crashed or is sleeping (free tier) | Check Render logs; free tier sleeps after 15 min -- first request wakes it up |

---

<div align="center">

Part of the [Arythm](https://github.com/aryanjsx/Arythm) project by [aryanjsx](https://aryankr.in)

</div>
