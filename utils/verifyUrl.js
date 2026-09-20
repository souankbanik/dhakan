/**
 * Link Health Guard: Verifies that a target URL is live and accessible via HTTP HEAD/GET request.
 */

/**
 * Validates whether a given URL is reachable over HTTP/HTTPS.
 * @param {string} url - Target URL to inspect.
 * @param {number} [timeoutMs=5000] - Timeout limit in milliseconds.
 * @returns {Promise<boolean>} True if reachable and HTTP status < 400, false otherwise.
 */
async function verifyUrl(url, timeoutMs = 5000) {
  if (!url || typeof url !== 'string') return false;

  // Basic URL syntax check
  let parsed;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      // 1. Attempt lightweight HTTP HEAD request
      response = await fetch(parsed.toString(), {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DHAKAN-Link-Guard/1.0',
          'Accept': '*/*',
        },
        redirect: 'follow',
      });
    } catch (headError) {
      if (headError.name === 'AbortError') {
        clearTimeout(timer);
        return false;
      }
      // If server does not support HEAD or resets connection, try GET
      response = await fetch(parsed.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DHAKAN-Link-Guard/1.0',
          'Range': 'bytes=0-100',
        },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }

    // If HEAD returns 405 (Method Not Allowed), retry with GET
    if (response.status === 405) {
      const getResponse = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DHAKAN-Link-Guard/1.0',
          'Range': 'bytes=0-100',
        },
        redirect: 'follow',
      });
      return getResponse.status < 400;
    }

    // HTTP status >= 400 represents an error or unreachable resource
    if (response.status >= 400) {
      return false;
    }

    return true;
  } catch (err) {
    // ENOTFOUND, ECONNREFUSED, timeout, or DNS resolution failure
    return false;
  }
}

module.exports = {
  verifyUrl,
};
