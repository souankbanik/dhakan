const db = require('./db');
const { schema } = require('./schema');

function initDatabase() {
  console.log('[DATABASE] Running schema synchronization and deprecated table purge...');

  // Migration: Drop all deprecated tables from removed features
  db.exec(`
    DROP TABLE IF EXISTS sticky_messages;
    DROP TABLE IF EXISTS shared_prompts;
    DROP TABLE IF EXISTS prompts;
    DROP TABLE IF EXISTS prompts_v2;
    DROP TABLE IF EXISTS prompt_interactions;
    DROP TABLE IF EXISTS suggestions;
    DROP TABLE IF EXISTS suggestion_votes;
    DROP TABLE IF EXISTS video_suggestions;
    DROP TABLE IF EXISTS video_ideas;
    DROP TABLE IF EXISTS showcases;
    DROP TABLE IF EXISTS showcase_votes;
    DROP TABLE IF EXISTS showcase_reviews;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS project_votes;
    DROP TABLE IF EXISTS resources;
    DROP TABLE IF EXISTS free_resources;
    DROP TABLE IF EXISTS ai_ratings;
    DROP TABLE IF EXISTS ai_models;
    DROP TABLE IF EXISTS model_ratings;
    DROP TABLE IF EXISTS youtube_alerts;
  `);

  // Execute retained table creations
  for (const [tableName, ddl] of Object.entries(schema)) {
    db.exec(ddl);
  }

  console.log('[DATABASE] Initialized successfully. Retained core tables: users, posted_drops, builder_profiles.');
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
