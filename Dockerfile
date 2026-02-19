FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install -U yt-dlp

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 10000

CMD ["node", "server.js"]
