/**
 * @kyntra/claude-hook — HTTP client
 *
 * Thin wrapper around the Kyntra governance API. This file is intentionally
 * tiny: it holds no principle logic, no rules, no decision-making. All
 * judgements come from the server-side engine (patent-pending).
 *
 * Fail-open by design: if the Kyntra API is unreachable or returns an error,
 * we emit a synthetic "allow" so Kyntra can never accidentally block legit
 * work due to our own bugs or outages.
 */

const DEFAULT_ENDPOINT = 'https://app.kyntra.ai.kr/api/governance/check';
const PKG_VERSION = '0.1.0';

/**
 * @typedef {object} GovernanceEvent
 * @property {string} event_type
 * @property {string=} tool
 * @property {string=} command
 * @property {string=} file_path
 * @property {string=} response_text
 * @property {object=} context
 */

/**
 * @typedef {object} GovernanceVerdict
 * @property {'allow'|'block'|'warn'} decision
 * @property {string=} layer
 * @property {string=} reason
 * @property {string=} principle_id
 * @property {'info'|'warning'|'critical'=} severity
 * @property {number=} latency_ms
 */

/**
 * Send a governance event to the Kyntra API and return the verdict.
 *
 * @param {GovernanceEvent} event
 * @param {{apiKey?: string, endpoint?: string, timeoutMs?: number}} [opts]
 * @returns {Promise<GovernanceVerdict>}
 */
export async function checkGovernance(event, opts = {}) {
  const url = opts.endpoint || process.env.KYNTRA_ENDPOINT || DEFAULT_ENDPOINT;
  const key = opts.apiKey || process.env.KYNTRA_API_KEY;
  const timeoutMs = opts.timeoutMs ?? 5000;

  if (!key) {
    return {
      decision: 'allow',
      layer: 'client-fallback',
      reason: 'KYNTRA_API_KEY not set — skipping governance check',
      severity: 'info',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'User-Agent': `@kyntra/claude-hook/${PKG_VERSION}`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        decision: 'allow',
        layer: 'client-fallback',
        reason: `Kyntra API ${res.status}: ${text.slice(0, 200)}`,
        severity: 'info',
      };
    }

    const verdict = await res.json();
    // Defensive normalization
    if (!verdict || typeof verdict !== 'object' || !verdict.decision) {
      return {
        decision: 'allow',
        layer: 'client-fallback',
        reason: 'Kyntra API returned unexpected shape',
        severity: 'info',
      };
    }
    return verdict;
  } catch (err) {
    return {
      decision: 'allow',
      layer: 'client-fallback',
      reason: `Kyntra client error: ${err?.message || String(err)}`,
      severity: 'info',
    };
  } finally {
    clearTimeout(timer);
  }
}

export { DEFAULT_ENDPOINT, PKG_VERSION };
