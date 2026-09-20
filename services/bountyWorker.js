/**
 * Anti-Ghosting Bounty Worker
 * Checks pending bounties older than 7 days every 6 hours,
 * marking them as EXPIRED / refunded and restoring 50 VibePoints to project creators.
 */

const db = require('../database/db');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BOUNTY_EXPIRATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Checks for overdue pending bounties and refunds project creators.
 *
 * @param {Object} [client] - Optional Discord client for notifications / logging
 * @returns {Array<{ bountyId: number, projectId: number, authorId: string, refundedAmount: number }>}
 */
function processOverdueBounties(client = null) {
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - BOUNTY_EXPIRATION_SECONDS;

  try {
    const overdueBounties = db
      .prepare(`
        SELECT b.id AS bountyId, b.projectId, b.reviewerId, b.createdAt, p.userId AS authorId, p.title AS projectTitle
        FROM bounties b
        JOIN projects p ON b.projectId = p.id
        WHERE b.status = 'PENDING'
          AND (b.refunded = 0 OR b.refunded IS NULL)
          AND b.createdAt <= ?
      `)
      .all(cutoffTimestamp);

    if (!overdueBounties || overdueBounties.length === 0) {
      return [];
    }

    const refundedBounties = [];

    for (const item of overdueBounties) {
      const success = db.transaction(() => {
        // 1. Mark bounty as refunded & EXPIRED
        db.prepare(`
          UPDATE bounties
          SET refunded = 1, status = 'EXPIRED'
          WHERE id = ?
        `).run(item.bountyId);

        // 2. Refund 50 VibePoints to the project creator
        db.prepare(`
          INSERT INTO users (userId, vibePoints, weeklyPoints)
          VALUES (?, 50, 50)
          ON CONFLICT(userId) DO UPDATE SET
            vibePoints = vibePoints + 50,
            weeklyPoints = weeklyPoints + 50
        `).run(item.authorId);

        return true;
      })();

      if (success) {
        refundedBounties.push({
          bountyId: item.bountyId,
          projectId: item.projectId,
          authorId: item.authorId,
          projectTitle: item.projectTitle,
          refundedAmount: 50,
        });

        console.log(
          `[BOUNTY WORKER] Refunded 50 VibePoints for expired bounty #${item.bountyId} (Project #${item.projectId}) to <@${item.authorId}>`
        );
      }
    }

    return refundedBounties;
  } catch (err) {
    console.error('[BOUNTY WORKER ERROR] Failed to process overdue bounties:', err);
    return [];
  }
}

/**
 * Starts the recurring anti-ghosting bounty worker timer.
 *
 * @param {import('discord.js').Client} client
 * @returns {NodeJS.Timeout}
 */
function startBountyWorker(client) {
  console.log('[BOUNTY WORKER] Initializing anti-ghosting bounty worker (interval: 6h).');

  // Run immediate check on startup
  try {
    processOverdueBounties(client);
  } catch (err) {
    console.error('[BOUNTY WORKER] Initial run error:', err);
  }

  // Schedule every 6 hours
  const interval = setInterval(() => {
    try {
      processOverdueBounties(client);
    } catch (err) {
      console.error('[BOUNTY WORKER] Scheduled run error:', err);
    }
  }, CHECK_INTERVAL_MS);

  if (interval.unref) interval.unref();
  return interval;
}

module.exports = {
  processOverdueBounties,
  startBountyWorker,
  CHECK_INTERVAL_MS,
  BOUNTY_EXPIRATION_SECONDS,
};
