/**
 * Database schema definitions for Rounit HQ Community Bot
 * Includes users, projects, project_votes, ai_models, model_ratings, and bounties.
 */

const PRE_SEEDED_MODELS = [
  'Claude 3.5 Sonnet',
  'GPT-4o',
  'Cursor Tab',
  'DeepSeek-Coder',
  'Gemini 1.5 Pro',
  'Qwen 2.5 Coder',
];

const schema = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      vibePoints INTEGER NOT NULL DEFAULT 0,
      weeklyPoints INTEGER NOT NULL DEFAULT 0,
      lastSubmissionTimestamp INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      totalUpvotesReceived INTEGER NOT NULL DEFAULT 0,
      totalProjects INTEGER NOT NULL DEFAULT 0,
      vibeCredits INTEGER NOT NULL DEFAULT 0,
      currentStreak INTEGER NOT NULL DEFAULT 0,
      lastStreakTimestamp INTEGER NOT NULL DEFAULT 0,
      totalProjectsSubmitted INTEGER NOT NULL DEFAULT 0,
      balance INTEGER NOT NULL DEFAULT 0,
      lastDaily INTEGER NOT NULL DEFAULT 0,
      warns INTEGER NOT NULL DEFAULT 0,
      firstDollarProof TEXT,
      firstDollarVerified BOOLEAN DEFAULT 0,
      roleTier TEXT DEFAULT 'Member'
    );
  `,

  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guildId TEXT,
      channelId TEXT,
      messageId TEXT,
      threadId TEXT,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      normalizedTitle TEXT,
      url TEXT,
      normalizedUrl TEXT,
      link TEXT,
      techStack TEXT,
      description TEXT,
      rounitScore INTEGER,
      rounitFeedback TEXT,
      upvotes INTEGER NOT NULL DEFAULT 0,
      upvoteCount INTEGER NOT NULL DEFAULT 0,
      isBounty INTEGER NOT NULL DEFAULT 0,
      bountiesClaimed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `,

  project_votes: `
    CREATE TABLE IF NOT EXISTS project_votes (
      projectId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      votedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      voterAwardedXP INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (projectId, userId),
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
  `,

  ai_models: `
    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      averageRating REAL NOT NULL DEFAULT 0.0,
      totalVotes INTEGER NOT NULL DEFAULT 0
    );
  `,

  model_ratings: `
    CREATE TABLE IF NOT EXISTS model_ratings (
      modelId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      score INTEGER NOT NULL,
      comment TEXT,
      ratedAt INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(modelId, userId),
      FOREIGN KEY(modelId) REFERENCES ai_models(id) ON DELETE CASCADE
    );
  `,

  bounties: `
    CREATE TABLE IF NOT EXISTS bounties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER NOT NULL,
      reviewerId TEXT NOT NULL,
      feedbackText TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      refunded BOOLEAN DEFAULT 0,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
  `,

  video_ideas: `
    CREATE TABLE IF NOT EXISTS video_ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED')),
      createdAt INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `,

  challenges: `
    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rewardPoints INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN DEFAULT 1
    );
  `,

  challenge_submissions: `
    CREATE TABLE IF NOT EXISTS challenge_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challengeId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      submissionText TEXT NOT NULL,
      reviewed BOOLEAN DEFAULT 0,
      createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(challengeId) REFERENCES challenges(id) ON DELETE CASCADE
    );
  `,

  model_incidents: `
    CREATE TABLE IF NOT EXISTS model_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelName TEXT NOT NULL,
      reportedBy TEXT NOT NULL,
      issueType TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `,
};

module.exports = {
  PRE_SEEDED_MODELS,
  schema,
};
