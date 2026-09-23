# Production Dockerfile for DHAKAN Discord Bot (Render / Fly.io / Container)
FROM node:22-slim

# Install build dependencies required for compiling native better-sqlite3 C++ bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Rebuild native better-sqlite3 bindings for container architecture
RUN npm rebuild better-sqlite3

# Copy application source code
COPY . .

# Ensure volume mount / database directory exists
RUN mkdir -p /data

# Default port for Render web service
ENV PORT=3000

# Automated startup: deploy application slash commands first, then start bot and health-check server
CMD ["sh", "-c", "node deploy-commands.js; node index.js"]
