const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema DDL inside a transaction
  db.exec(schema);

  // Ensure all Builder XP and leveling columns exist on users table for existing databases
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  const requiredColumns = [
    { name: 'xp', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'level', type: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'totalUpvotesReceived', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'totalProjects', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'vibeCredits', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'vibePoints', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'weeklyPoints', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'lastSubmissionTimestamp', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'currentStreak', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'lastStreakTimestamp', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'totalProjectsSubmitted', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'lastLogTimestamp', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'logStreak', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'firstDollarProof', type: 'TEXT' },
    { name: 'firstDollarVerified', type: 'BOOLEAN DEFAULT 0' },
    { name: 'roleTier', type: "TEXT DEFAULT 'Member'" },
  ];

  for (const col of requiredColumns) {
    if (!userColumns.includes(col.name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`).run();
    }
  }

  // Ensure refunded column on bounties table
  const bountyColumns = db.prepare("PRAGMA table_info(bounties)").all().map((c) => c.name);
  if (!bountyColumns.includes('refunded')) {
    db.prepare('ALTER TABLE bounties ADD COLUMN refunded BOOLEAN DEFAULT 0').run();
  }

  // Ensure all columns exist on projects table
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
  const requiredProjectColumns = [
    { name: 'threadId', type: 'TEXT' },
    { name: 'normalizedTitle', type: 'TEXT' },
    { name: 'url', type: 'TEXT' },
    { name: 'normalizedUrl', type: 'TEXT' },
    { name: 'rounitScore', type: 'INTEGER' },
    { name: 'rounitFeedback', type: 'TEXT' },
    { name: 'upvotes', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'isBounty', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'bountiesClaimed', type: 'INTEGER NOT NULL DEFAULT 0' },
  ];

  for (const col of requiredProjectColumns) {
    if (!projectColumns.includes(col.name)) {
      db.prepare(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`).run();
    }
  }

  // Create indices on projects for normalized fields
  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_norm_url ON projects(normalizedUrl)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_projects_norm_title ON projects(normalizedTitle)').run();
  } catch (idxErr) {
    console.warn('[DB INIT WARN] Index creation notice:', idxErr.message);
  }

  // Ensure columns on project_showcases table
  const showcaseColumns = db.prepare("PRAGMA table_info(project_showcases)").all().map((c) => c.name);
  const requiredShowcaseColumns = [
    { name: 'normalizedTitle', type: 'TEXT' },
    { name: 'normalizedUrl', type: 'TEXT' },
    { name: 'rounitScore', type: 'INTEGER' },
    { name: 'rounitFeedback', type: 'TEXT' },
  ];

  for (const col of requiredShowcaseColumns) {
    if (!showcaseColumns.includes(col.name)) {
      db.prepare(`ALTER TABLE project_showcases ADD COLUMN ${col.name} ${col.type}`).run();
    }
  }

  // Pre-seed standard AI models
  const preSeededModels = [
    'Claude 3.5 Sonnet',
    'GPT-4o',
    'Cursor Tab',
    'DeepSeek-Coder',
    'Gemini 1.5 Pro',
    'Qwen 2.5 Coder',
  ];

  const insertModel = db.prepare('INSERT OR IGNORE INTO ai_models (name, averageRating, totalVotes) VALUES (?, 0.0, 0)');
  for (const modelName of preSeededModels) {
    insertModel.run(modelName);
  }

  // Ensure default level is 1
  db.prepare('UPDATE users SET level = 1 WHERE level IS NULL OR level < 1').run();

  // Sync totalProjects with totalProjectsSubmitted if needed
  db.prepare('UPDATE users SET totalProjects = totalProjectsSubmitted WHERE totalProjects = 0 AND totalProjectsSubmitted > 0').run();

  // Migrate legacy balance to vibeCredits and lastDaily to lastStreakTimestamp if needed
  if (userColumns.includes('balance') && userColumns.includes('lastDaily')) {
    db.prepare(`
      UPDATE users 
      SET vibeCredits = balance,
          vibePoints = balance,
          lastStreakTimestamp = lastDaily 
      WHERE vibeCredits = 0 AND balance > 0
    `).run();
  }

  console.log('Database initialized successfully.');

  // Validate tables created
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();

  console.log('Configured tables:');
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
    console.log(`  - ${table.name} (${columns.map(c => `${c.name}: ${c.type}`).join(', ')})`);
  }

  return tables;
}

if (require.main === module) {
  try {
    initDatabase();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

module.exports = { initDatabase };
