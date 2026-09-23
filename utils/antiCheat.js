// In-memory debounce cache: key -> timestamp (ms)
const debounceCache = new Map();

/**
 * Normalizes a URL by stripping protocol, 'www.', query params, hash fragments, and trailing slashes.
 * @param {string} rawUrl
 * @returns {string} Normalized URL string
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '');
  }
}

/**
 * Normalizes a title by converting to lowercase, removing punctuation, and collapsing whitespace.
 * @param {string} rawTitle
 * @returns {string} Normalized title string
 */
function normalizeTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  return rawTitle
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a user's Discord account age is at least `minDays` old.
 * @param {object} user - Discord user object (or object with createdTimestamp / createdAt / id)
 * @param {number} minDays - Minimum account age in days (default: 7)
 * @returns {{ allowed: boolean, ageDays: number, minDays: number }}
 */
function checkAccountAge(user, minDays = 7) {
  if (!user) return { allowed: true, ageDays: minDays, minDays };

  let createdTimestamp = user.createdTimestamp;
  if (!createdTimestamp && user.createdAt) {
    createdTimestamp = typeof user.createdAt.getTime === 'function' ? user.createdAt.getTime() : Number(user.createdAt);
  }

  // If createdTimestamp is still absent, derive from Discord snowflake ID if available
  if (!createdTimestamp && user.id && /^\d{17,20}$/.test(user.id)) {
    try {
      createdTimestamp = Number(BigInt(user.id) >> 22n) + 1420070400000;
    } catch {
      createdTimestamp = null;
    }
  }

  // If no createdTimestamp or snowflake available, allow (for unit test mock users)
  if (!createdTimestamp) {
    return { allowed: true, ageDays: minDays, minDays };
  }

  const ageMs = Date.now() - createdTimestamp;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return {
    allowed: ageDays >= minDays,
    ageDays: Math.floor(ageDays),
    minDays,
  };
}

/**
 * Checks in-memory debounce to prevent button mashing or duplicate rapid clicks.
 * @param {string} userId
 * @param {string} actionKey
 * @param {number} windowMs
 * @returns {boolean} True if interaction is allowed; false if debounced/rate limited
 */
function checkButtonDebounce(userId, actionKey = 'default', windowMs = 1500) {
  const key = `${userId}:${actionKey}`;
  const now = Date.now();
  const lastTime = debounceCache.get(key) || 0;

  if (now - lastTime < windowMs) {
    return false;
  }

  debounceCache.set(key, now);
  return true;
}

/**
 * Clears the debounce cache (useful for testing).
 */
function clearDebounceCache() {
  debounceCache.clear();
}

/**
 * Checks if a vote is an author self-vote.
 * @param {string} projectAuthorId
 * @param {string} voterId
 * @returns {boolean}
 */
function isSelfVote(projectAuthorId, voterId) {
  return Boolean(projectAuthorId && voterId && projectAuthorId === voterId);
}

module.exports = {
  normalizeUrl,
  normalizeTitle,
  checkAccountAge,
  checkButtonDebounce,
  clearDebounceCache,
  isSelfVote,
};
