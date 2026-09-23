/**
 * Database schema definitions for GOKU Discord Bot (Utility OS)
 * 1. AI News Radar (posted_drops for deduplication)
 * 2. Domain Checker (/check-domain - stateless DNS/DoH lookups)
 * 3. Builder Connect (/connect - builder matchmaker and profiles)
 */

const schema = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      vibePoints INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
  `,

  posted_drops: `
    CREATE TABLE IF NOT EXISTS posted_drops (
      id TEXT PRIMARY KEY,
      postedAt INTEGER NOT NULL
    );
  `,

  builder_profiles: `
    CREATE TABLE IF NOT EXISTS builder_profiles (
      userId TEXT PRIMARY KEY,
      bio TEXT,
      skills TEXT,
      github TEXT,
      portfolio TEXT,
      updatedAt INTEGER NOT NULL
    );
  `,
};

module.exports = {
  schema,
};
