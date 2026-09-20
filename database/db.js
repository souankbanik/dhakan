const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
require('dotenv').config();

// Resolve database path: prioritize DB_PATH, fallback to DATABASE_PATH, default to ../database.sqlite
const rawDbPath = process.env.DB_PATH || process.env.DATABASE_PATH;
const dbPath = rawDbPath
  ? (path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(process.cwd(), rawDbPath))
  : path.join(__dirname, '../database.sqlite');

// Ensure parent directory of DB_PATH exists synchronously
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Preserve existing local development data if migrating from legacy bot.db
if (!fs.existsSync(dbPath) && fs.existsSync(path.join(__dirname, 'bot.db'))) {
  try {
    fs.copyFileSync(path.join(__dirname, 'bot.db'), dbPath);
  } catch {
    // Ignore copy error, clean database will be initialized
  }
}

// Initialize SQLite database instance
const db = new Database(dbPath);

// Enable WAL mode for concurrency and foreign keys for integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
