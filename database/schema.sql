-- Users table: tracks Builder XP, levels, project submissions, and streaks
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
    lastLogTimestamp INTEGER NOT NULL DEFAULT 0,
    logStreak INTEGER NOT NULL DEFAULT 0,
    balance INTEGER NOT NULL DEFAULT 0,
    lastDaily INTEGER NOT NULL DEFAULT 0,
    warns INTEGER NOT NULL DEFAULT 0,
    firstDollarProof TEXT,
    firstDollarVerified BOOLEAN DEFAULT 0,
    roleTier TEXT DEFAULT 'Member'
);

-- Leave of Absence (LOA) requests table
CREATE TABLE IF NOT EXISTS loa_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewedBy TEXT,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Guild configuration and minigame state
CREATE TABLE IF NOT EXISTS guild_settings (
    guildId TEXT PRIMARY KEY,
    countingChannel TEXT,
    loaLogChannel TEXT,
    welcomeVoiceChannel TEXT,
    partnerChannel TEXT,
    countingCurrentNumber INTEGER NOT NULL DEFAULT 0,
    countingLastUser TEXT
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_loa_userId ON loa_requests(userId);
CREATE INDEX IF NOT EXISTS idx_loa_status ON loa_requests(status);

-- Partner Applications table
CREATE TABLE IF NOT EXISTS partner_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    serverName TEXT NOT NULL,
    inviteLink TEXT NOT NULL,
    memberCount INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reviewedBy TEXT,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_partner_guild ON partner_applications(guildId);
CREATE INDEX IF NOT EXISTS idx_partner_status ON partner_applications(status);

-- Ticket Settings table
CREATE TABLE IF NOT EXISTS ticket_settings (
    guildId TEXT PRIMARY KEY,
    ticketCategoryId TEXT,
    supportRoleId TEXT,
    ticketCounter INTEGER NOT NULL DEFAULT 0
);

-- Support Tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT NOT NULL,
    channelId TEXT NOT NULL,
    userId TEXT NOT NULL,
    ticketNumber INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    closedAt INTEGER,
    closedById TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guildId);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(userId);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- YouTube Uploads Cache table
CREATE TABLE IF NOT EXISTS youtube_cache (
    channelId TEXT PRIMARY KEY,
    lastVideoId TEXT NOT NULL,
    title TEXT,
    publishedAt TEXT,
    updatedAt INTEGER NOT NULL
);

-- Community Project Showcases table
CREATE TABLE IF NOT EXISTS project_showcases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    projectName TEXT NOT NULL,
    projectLink TEXT NOT NULL,
    techStack TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    reviewedBy TEXT,
    publicMessageId TEXT,
    publicChannelId TEXT,
    upvoteCount INTEGER NOT NULL DEFAULT 0,
    submittedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    reviewedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_showcase_guild ON project_showcases(guildId);
CREATE INDEX IF NOT EXISTS idx_showcase_user ON project_showcases(userId);
CREATE INDEX IF NOT EXISTS idx_showcase_status ON project_showcases(status);

-- Project Community Upvotes table
CREATE TABLE IF NOT EXISTS project_upvotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(projectId, userId),
    FOREIGN KEY(projectId) REFERENCES project_showcases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_upvotes_project ON project_upvotes(projectId);

-- Member Onboarding table
CREATE TABLE IF NOT EXISTS member_onboarding (
    userId TEXT NOT NULL,
    guildId TEXT NOT NULL,
    agreedRules INTEGER NOT NULL DEFAULT 1,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (userId, guildId)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_guild ON member_onboarding(guildId);

-- Unified Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guildId TEXT,
    channelId TEXT,
    messageId TEXT,
    threadId TEXT,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    normalizedTitle TEXT,
    link TEXT,
    url TEXT,
    normalizedUrl TEXT,
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

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(userId);
CREATE INDEX IF NOT EXISTS idx_projects_upvotes ON projects(upvoteCount DESC);

-- Project Votes table (supports toggling unvotes & voter XP cap attribution)
CREATE TABLE IF NOT EXISTS project_votes (
    projectId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    votedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    voterAwardedXP INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (projectId, userId),
    FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_votes_user ON project_votes(userId);

-- XP Transactions ledger
CREATE TABLE IF NOT EXISTS xp_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_xp_tx_user ON xp_transactions(userId);
CREATE INDEX IF NOT EXISTS idx_xp_tx_reason ON xp_transactions(reason);
CREATE INDEX IF NOT EXISTS idx_xp_tx_time ON xp_transactions(timestamp);

-- AI Model Tier List table
CREATE TABLE IF NOT EXISTS ai_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    averageRating REAL NOT NULL DEFAULT 0.0,
    totalVotes INTEGER NOT NULL DEFAULT 0
);

-- AI Model Community Ratings table
CREATE TABLE IF NOT EXISTS model_ratings (
    modelId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    score INTEGER NOT NULL,
    comment TEXT,
    ratedAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(modelId, userId),
    FOREIGN KEY(modelId) REFERENCES ai_models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_model_ratings_model ON model_ratings(modelId);
CREATE INDEX IF NOT EXISTS idx_model_ratings_user ON model_ratings(userId);

-- Feedback Bounties table
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

CREATE INDEX IF NOT EXISTS idx_bounties_project ON bounties(projectId);
CREATE INDEX IF NOT EXISTS idx_bounties_reviewer ON bounties(reviewerId);

-- Community Prompt Library tables
CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    bookmarks INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS prompt_bookmarks (
    promptId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(promptId, userId),
    FOREIGN KEY(promptId) REFERENCES prompts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompts_bookmarks ON prompts(bookmarks DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_user ON prompts(userId);
CREATE INDEX IF NOT EXISTS idx_prompt_bm_user ON prompt_bookmarks(userId);

-- YouTube Video Ideas table
CREATE TABLE IF NOT EXISTS video_ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'ACCEPTED')),
    createdAt INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_video_ideas_user ON video_ideas(userId);
CREATE INDEX IF NOT EXISTS idx_video_ideas_status ON video_ideas(status);

-- Community Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rewardPoints INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT 1
);

-- Community Challenge Submissions table
CREATE TABLE IF NOT EXISTS challenge_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challengeId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    submissionText TEXT NOT NULL,
    reviewed BOOLEAN DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY(challengeId) REFERENCES challenges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_challenge_sub_chal ON challenge_submissions(challengeId);
CREATE INDEX IF NOT EXISTS idx_challenge_sub_user ON challenge_submissions(userId);

-- AI Model Incidents table
CREATE TABLE IF NOT EXISTS model_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modelName TEXT NOT NULL,
    reportedBy TEXT NOT NULL,
    issueType TEXT NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_model_incidents_model ON model_incidents(modelName);

