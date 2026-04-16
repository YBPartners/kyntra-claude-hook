#!/usr/bin/env node
/**
 * @kyntra/claude-hook — bridge
 *
 * Invoked by Claude Code hooks (PreToolUse, PostToolUse, Stop).
 * Reads a JSON event on stdin, forwards it to the Kyntra governance API,
 * and exits with:
 *
 *   0 → allow  (or warn: exits 0 but prints reason on stderr)
 *   2 → block  (stderr: reason; Claude Code treats exit 2 as refusal)
 *
 * Fail-open: if anything goes wrong on our side (network, parse, crash),
 * we exit 0 with a stderr note. Kyntra will never block legitimate work
 * because of its own bugs.
 */

import { checkGovernance } from './client.js';

/**
 * Read stdin until EOF or 200ms of silence (hook called without a payload).
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const settle = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => settle(data));
    process.stdin.on('error', () => settle(data));

    // Belt-and-suspenders: if nothing arrives in 200ms, give up gracefully.
    setTimeout(() => {
      if (!data) settle('');
    }, 200);
  });
}

/**
 * Normalize a Claude Code hook payload into our governance event shape.
 * Claude Code hook payload keys vary by event type — we map the common ones
 * and pass the full original object through as `context` for server-side
 * interpretation.
 */
function normalizeEvent(raw) {
  if (!raw) return { event_type: 'unknown' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { event_type: 'unknown', context: { raw: raw.slice(0, 2000) } };
  }

  return {
    event_type:
      parsed.hook_event_name || parsed.event_type || parsed.event || 'unknown',
    tool: parsed.tool_name || parsed.tool || undefined,
    command:
      parsed.tool_input?.command ||
      parsed.command ||
      undefined,
    file_path:
      parsed.tool_input?.file_path ||
      parsed.tool_input?.filePath ||
      parsed.file_path ||
      undefined,
    diff: parsed.tool_input?.new_string || parsed.diff || undefined,
    response_text:
      typeof parsed.transcript === 'string'
        ? parsed.transcript
        : typeof parsed.response_text === 'string'
          ? parsed.response_text
          : undefined,
    context: parsed,
  };
}

/**
 * Build context-aware watermark message.
 * - Conversation/planning: "not a monitoring target"
 * - Tool use: detailed governance feedback with principle references
 */
function buildWatermark(event, verdict) {
  const S = '\u{1F6E1}'; // shield
  const d = verdict.decision || 'allow';
  const ms = verdict.latency_ms != null ? `${verdict.latency_ms}ms` : '';
  const layer = verdict.layer || '';
  const tool = event.tool || '';
  const cmd = event.command ? event.command.slice(0, 60) : '';
  const fp = event.file_path ? event.file_path.split(/[/\\]/).pop() : '';
  const pid = verdict.principle_id || '';
  const reason = verdict.reason || '';
  const evType = (event.event_type || '').toLowerCase();

  // ── Conversation / planning: not a monitoring target ──
  if (evType === 'userpromptsubmit' || evType === 'user_prompt_submit') {
    return `${S} KYNTRA \u2501 conversation mode \u00B7 governance activates on tool use`;
  }

  // ── Stop: session summary ──
  if (evType === 'stop') {
    return `${S} KYNTRA \u2501 response verified \u00B7 governance active`;
  }

  // ── PostToolUse: brief post-check ──
  if (evType === 'posttooluse' || evType === 'post_tool_use') {
    const target = fp || tool || 'output';
    if (d === 'warn') {
      return `${S} KYNTRA \u2501 post-check ${target} \u2192 warn \u00B7 ${reason || pid}`;
    }
    return `${S} KYNTRA \u2501 post-check ${target} \u2192 ok \u00B7 no violations`;
  }

  // ── PreToolUse: THE MAIN EVENT — detailed governance feedback ──
  const parts = [`${S} KYNTRA \u2501`];

  // What was checked
  if (tool === 'Bash' && cmd) {
    parts.push(`Bash: "${cmd}${event.command && event.command.length > 60 ? '...' : ''}"`);
  } else if (tool && fp) {
    parts.push(`${tool}: ${fp}`);
  } else if (tool) {
    parts.push(tool);
  }

  // Verdict
  parts.push(`\u2192 ${d.toUpperCase()}`);

  // Principle reference (the key differentiator)
  if (pid) {
    parts.push(pid);
  }

  // Layer + latency
  const meta = [];
  if (layer) meta.push(`layer:${layer}`);
  if (ms) meta.push(ms);
  if (meta.length) parts.push(meta.join(' \u00B7 '));

  return parts.join(' \u00B7 ');
}

async function main() {
  const raw = await readStdin();
  if (!raw) {
    // Hook invoked with no payload — nothing to check.
    process.exit(0);
  }

  const event = normalizeEvent(raw);
  const verdict = await checkGovernance(event);

  if (verdict.decision === 'block') {
    const lines = [
      '',
      `[KYNTRA] BLOCKED — ${verdict.reason || 'Governance violation detected'}`,
    ];
    if (verdict.principle_id) lines.push(`         Principle: ${verdict.principle_id}`);
    if (verdict.layer) lines.push(`         Layer: ${verdict.layer}`);
    if (verdict.severity) lines.push(`         Severity: ${verdict.severity}`);
    lines.push('');
    process.stderr.write(lines.join('\n'));
    process.exit(2);
  }

  if (verdict.decision === 'warn') {
    const tag = verdict.principle_id ? ` (${verdict.principle_id})` : '';
    process.stderr.write(
      `[KYNTRA] warn — ${verdict.reason || 'Soft violation'}${tag}\n`,
    );
  }

  // Governance watermark — context-aware feedback via stdout JSON
  const watermark = buildWatermark(event, verdict);
  process.stdout.write(JSON.stringify({
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: event.event_type,
      additionalContext: watermark,
    },
  }));

  // allow / warn → exit 0
  process.exit(0);
}

main().catch((err) => {
  // Last-resort fail-open
  process.stderr.write(
    `[KYNTRA] client crash (fail-open): ${err?.message || String(err)}\n`,
  );
  process.exit(0);
});
