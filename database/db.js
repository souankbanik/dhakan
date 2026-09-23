const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
require('dotenv').config();

// Resolve database path: process.env.DB_PATH or default to ../database.sqlite
const rawDbPath = process.env.DB_PATH || process.env.DATABASE_PATH;
const dbPath = rawDbPath
  ? (path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(process.cwd(), rawDbPath))
  : path.join(__dirname, '../database.sqlite');

// Ensure parent directory of dbPath exists synchronously
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Initialize SQLite database instance
const db = new Database(dbPath);

// Enable WAL mode for concurrency and foreign keys for integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
