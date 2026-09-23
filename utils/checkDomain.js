/**
 * DNS-over-HTTPS (DoH) Domain Verification Utility
 * Queries Cloudflare DoH API (https://cloudflare-dns.com/dns-query) to check domain registration & DNS records.
 */

const DNS_STATUS_CODES = {
  0: 'NOERROR (Domain active/registered)',
  1: 'FORMERR (Format error)',
  2: 'SERVFAIL (Server failure)',
  3: 'NXDOMAIN (Domain not registered / available)',
  4: 'NOTIMP (Not implemented)',
  5: 'REFUSED (Query refused)',
};

/**
 * Sanitizes a raw input domain name.
 * Strips http://, https://, paths, ports, and whitespace.
 *
 * @param {string} rawDomain
 * @returns {string}
 */
function cleanDomainName(rawDomain) {
  if (!rawDomain || typeof rawDomain !== 'string') return '';
  let cleaned = rawDomain.trim().toLowerCase();
  cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, ''); // strip scheme
  cleaned = cleaned.split('/')[0]; // strip path
  cleaned = cleaned.split('?')[0]; // strip query
  cleaned = cleaned.split('#')[0]; // strip hash
  cleaned = cleaned.split(':')[0]; // strip port
  return cleaned;
}

/**
 * Queries Cloudflare DoH API to check domain resolution.
 *
 * @param {string} rawDomain
 * @param {Object} [options]
 * @param {Function} [options.fetchFn=globalThis.fetch] - Mockable fetch implementation for tests
 * @param {number} [options.timeoutMs=5000]
 * @returns {Promise<{ domain: string, registered: boolean, status: number, statusText: string, answers: Array, authority: Array, ips: Array<string> }>}
 */
async function checkDomain(rawDomain, options = {}) {
  const domain = cleanDomainName(rawDomain);
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 5000;

  if (!domain || !domain.includes('.')) {
    return {
      domain,
      registered: false,
      status: -1,
      statusText: 'Invalid domain format',
      answers: [],
      authority: [],
      ips: [],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`;
    const response = await fetchFn(url, {
      headers: {
        Accept: 'application/dns-json',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        domain,
        registered: false,
        status: response.status,
        statusText: `HTTP error ${response.status}`,
        answers: [],
        authority: [],
        ips: [],
      };
    }

    const data = await response.json();
    const statusCode = typeof data.Status === 'number' ? data.Status : -1;
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    const authority = Array.isArray(data.Authority) ? data.Authority : [];

    // Registered if Status == 0 (NOERROR) or answers exist, or authority indicates zone exists
    const registered = statusCode === 0 || answers.length > 0;
    const ips = answers.filter((a) => a.type === 1).map((a) => a.data);

    return {
      domain,
      registered,
      status: statusCode,
      statusText: DNS_STATUS_CODES[statusCode] || `DNS Status ${statusCode}`,
      answers,
      authority,
      ips,
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      domain,
      registered: false,
      status: -1,
      statusText: error.name === 'AbortError' ? 'Lookup timed out' : error.message,
      answers: [],
      authority: [],
      ips: [],
    };
  }
}

module.exports = {
  checkDomain,
  cleanDomainName,
  DNS_STATUS_CODES,
};
