-- DHAKAN Database Schema (Core 3 Features)
-- 1. AI News Radar (posted_drops for deduplication)
-- 2. Domain Checker (stateless Cloudflare DoH)
-- 3. Builder Connect (builder matchmaker & profiles)

CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    vibePoints INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posted_drops (
    id TEXT PRIMARY KEY,
    postedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS builder_profiles (
    userId TEXT PRIMARY KEY,
    bio TEXT,
    skills TEXT,
    github TEXT,
    portfolio TEXT,
    updatedAt INTEGER NOT NULL
);
