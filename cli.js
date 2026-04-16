#!/usr/bin/env node
/**
 * @kyntra/claude-hook — installer CLI
 *
 *   npx @kyntra/claude-hook install       Append hooks to ~/.claude/settings.json
 *   npx @kyntra/claude-hook status        Check if hooks are installed and API key works
 *   npx @kyntra/claude-hook print-config  Print the hook JSON snippet and exit
 *   npx @kyntra/claude-hook uninstall     Remove Kyntra hooks from settings.json
 *   npx @kyntra/claude-hook --help
 *
 * Installation steps performed:
 *   1. Resolve ~/.claude/settings.json (create dir if missing)
 *   2. Back up the file to settings.json.bak-<ISO timestamp>
 *   3. Merge Kyntra hooks into the existing `hooks` tree (de-duplicated)
 *   4. Write the result atomically
 *
 * The hooks invoke `node <absolute-path-to-bridge.js>` which stays resolvable
 * even when the user updates the package — npm handles the path rewrite.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = path.join(__dirname, 'bridge.js');
const KYNTRA_MARKER = '@kyntra/claude-hook'; // used to identify our own entries

// ─── Hook snippet ─────────────────────────────────────

function buildHookSnippet() {
  const cmd = `node "${BRIDGE_PATH}"`;
  return {
    PreToolUse: [
      {
        matcher: 'Bash|Edit|Write|MultiEdit',
        hooks: [{ type: 'command', command: cmd, _kyntra: KYNTRA_MARKER }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write|MultiEdit',
        hooks: [{ type: 'command', command: cmd, _kyntra: KYNTRA_MARKER }],
      },
    ],
    Stop: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: cmd, _kyntra: KYNTRA_MARKER }],
      },
    ],
  };
}

function settingsPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

// ─── Commands ─────────────────────────────────────────

function usage() {
  process.stdout.write(`@kyntra/claude-hook — Real-time AI agent governance for Claude Code

Usage:
  npx @kyntra/claude-hook install       Install hooks into ~/.claude/settings.json
  npx @kyntra/claude-hook status        Check installation and API key status
  npx @kyntra/claude-hook print-config  Print the hook JSON snippet and exit
  npx @kyntra/claude-hook uninstall     Remove Kyntra hooks from settings.json
  npx @kyntra/claude-hook --help        Show this help

Environment:
  KYNTRA_API_KEY   Required. Sign up at https://kyntra.ai.kr/pricing
  KYNTRA_ENDPOINT  Optional override (default: https://app.kyntra.ai.kr/api/governance/check)

Homepage:  https://kyntra.ai.kr
License:   MIT (client adapter only — server engine is patent-pending)
`);
}

// ─── OS detection ────────────────────────────────────

function getEnvInstructions() {
  const p = process.platform;
  if (p === 'win32') {
    return {
      platform: 'Windows',
      permanent: 'powershell -Command "[System.Environment]::SetEnvironmentVariable(\'KYNTRA_API_KEY\', \'ky_live_YOUR_KEY_HERE\', \'User\')"',
      temporary: 'set KYNTRA_API_KEY=ky_live_YOUR_KEY_HERE',
      note: 'After setting, close and reopen your terminal (or Claude Code) for it to take effect.',
    };
  }
  if (p === 'darwin') {
    return {
      platform: 'macOS',
      permanent: 'echo \'export KYNTRA_API_KEY=ky_live_YOUR_KEY_HERE\' >> ~/.zshrc && source ~/.zshrc',
      temporary: 'export KYNTRA_API_KEY=ky_live_YOUR_KEY_HERE',
      note: 'Restart Claude Code after setting.',
    };
  }
  return {
    platform: 'Linux',
    permanent: 'echo \'export KYNTRA_API_KEY=ky_live_YOUR_KEY_HERE\' >> ~/.bashrc && source ~/.bashrc',
    temporary: 'export KYNTRA_API_KEY=ky_live_YOUR_KEY_HERE',
    note: 'Restart Claude Code after setting.',
  };
}

// ─── Status command ──────────────────────────────────

async function status() {
  const file = settingsPath();
  const checks = [];

  // 1. settings.json exists
  const fileExists = fs.existsSync(file);
  checks.push({ label: 'settings.json exists', ok: fileExists, detail: fileExists ? file : 'NOT FOUND' });

  // 2. Kyntra hooks present
  let hooksFound = false;
  if (fileExists) {
    const settings = readSettings(file);
    const hookEvents = settings.hooks || {};
    for (const evName of Object.keys(hookEvents)) {
      const entries = Array.isArray(hookEvents[evName]) ? hookEvents[evName] : [];
      for (const entry of entries) {
        const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
        if (hooks.some((h) => h?._kyntra === KYNTRA_MARKER)) { hooksFound = true; break; }
      }
      if (hooksFound) break;
    }
  }
  checks.push({ label: 'Kyntra hooks installed', ok: hooksFound, detail: hooksFound ? 'PreToolUse + PostToolUse + Stop' : 'Run: npx @kyntra/claude-hook install' });

  // 3. API key in environment
  const apiKey = process.env.KYNTRA_API_KEY || '';
  const keySet = apiKey.length > 0;
  checks.push({ label: 'KYNTRA_API_KEY set', ok: keySet, detail: keySet ? `${apiKey.slice(0, 12)}...` : 'NOT SET — see instructions below' });

  // 4. API connectivity (only if key is set)
  let apiOk = false;
  let apiDetail = 'skipped (no API key)';
  if (keySet) {
    try {
      const endpoint = process.env.KYNTRA_ENDPOINT || 'https://app.kyntra.ai.kr/api/governance/check';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'status_check', tool: 'StatusCheck', command: 'echo kyntra-status-test' }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.decision) {
        apiOk = true;
        apiDetail = `${res.status} OK — tier: ${body.tier || 'unknown'}, latency: ${body.latency_ms || '?'}ms`;
      } else if (res.status === 402) {
        apiDetail = `${res.status} — API key valid but no active subscription. Subscribe at https://kyntra.ai.kr/pricing`;
      } else {
        apiDetail = `${res.status} — ${body.error || body.message || 'unexpected response'}`;
      }
    } catch (err) {
      apiDetail = `FAILED — ${err?.message || String(err)}`;
    }
  }
  checks.push({ label: 'API connectivity', ok: apiOk, detail: apiDetail });

  // Print results
  process.stdout.write('\n  @kyntra/claude-hook — Status\n\n');
  for (const c of checks) {
    const icon = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    process.stdout.write(`  ${icon}  ${c.label}\n     ${c.detail}\n\n`);
  }

  const allOk = checks.every((c) => c.ok);
  if (allOk) {
    process.stdout.write('  \x1b[32m🛡  Kyntra governance is active.\x1b[0m\n');
    process.stdout.write('  Every Claude Code tool call is being verified in real time.\n\n');
  } else {
    if (!keySet) {
      const env = getEnvInstructions();
      process.stdout.write(`  ── How to set KYNTRA_API_KEY (${env.platform}) ──\n\n`);
      process.stdout.write(`  Permanent:\n    ${env.permanent}\n\n`);
      process.stdout.write(`  This session only:\n    ${env.temporary}\n\n`);
      process.stdout.write(`  ${env.note}\n\n`);
      process.stdout.write(`  Don't have a key? Sign up at https://kyntra.ai.kr/pricing\n\n`);
    }
    process.stdout.write('  Run \x1b[36mnpx @kyntra/claude-hook status\x1b[0m again after fixing.\n\n');
  }
}

function printConfig() {
  const snippet = { hooks: buildHookSnippet() };
  process.stdout.write(JSON.stringify(snippet, null, 2) + '\n');
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw || '{}');
  } catch (err) {
    process.stderr.write(
      `✗  ~/.claude/settings.json is not valid JSON — aborting.\n   ${err.message}\n`,
    );
    process.exit(1);
  }
}

function backupIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, backup);
  return backup;
}

function mergeHooks(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const eventName of Object.keys(incoming)) {
    const prev = Array.isArray(merged[eventName]) ? merged[eventName] : [];
    const next = incoming[eventName];
    // Drop any previous Kyntra entries (marker match) so re-install is idempotent
    const cleaned = prev.filter((entry) => {
      const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
      return !hooks.some((h) => h?._kyntra === KYNTRA_MARKER);
    });
    merged[eventName] = [...cleaned, ...next];
  }
  return merged;
}

function stripHooks(existing) {
  const out = { ...(existing || {}) };
  for (const eventName of Object.keys(out)) {
    if (!Array.isArray(out[eventName])) continue;
    out[eventName] = out[eventName].filter((entry) => {
      const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
      return !hooks.some((h) => h?._kyntra === KYNTRA_MARKER);
    });
    if (out[eventName].length === 0) delete out[eventName];
  }
  return out;
}

function writeSettings(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(obj, null, 2) + '\n';
  // Atomic write via tmp file + rename on same filesystem
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

function install() {
  if (!process.env.KYNTRA_API_KEY) {
    process.stderr.write(
      '\n⚠  KYNTRA_API_KEY environment variable is not set.\n' +
        '   Sign up at https://kyntra.ai.kr/pricing to get one, then:\n' +
        '     export KYNTRA_API_KEY=ky_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n' +
        '\n   Proceeding with install — the hook will fail-open at runtime until the key is set.\n\n',
    );
  }

  const file = settingsPath();
  const existing = readSettings(file);
  const backup = backupIfExists(file);

  const mergedHooks = mergeHooks(existing.hooks, buildHookSnippet());
  const next = { ...existing, hooks: mergedHooks };
  writeSettings(file, next);

  process.stdout.write(`\n✓  Installed Kyntra hooks → ${file}\n`);
  if (backup) process.stdout.write(`✓  Backup saved → ${backup}\n`);

  const env = getEnvInstructions();

  if (!process.env.KYNTRA_API_KEY) {
    process.stdout.write(
      `\n── Step 1: Set your API key (${env.platform}) ──\n\n` +
      `  ${env.permanent}\n\n` +
      `  ${env.note}\n\n` +
      `  Don't have a key? Sign up at https://kyntra.ai.kr/pricing\n`,
    );
  }

  process.stdout.write(
    `\n── Step 2: Restart Claude Code ──\n\n` +
    `  Close and reopen Claude Code completely (not just a new session).\n`,
  );

  process.stdout.write(
    `\n── Step 3: Verify ──\n\n` +
    `  npx @kyntra/claude-hook status\n\n` +
    `  This will check if hooks are installed, API key is loaded,\n` +
    `  and the governance engine is reachable.\n\n` +
    `Manage your account: https://app.kyntra.ai.kr\n`,
  );
}

function uninstall() {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    process.stdout.write(`No settings.json at ${file} — nothing to remove.\n`);
    return;
  }
  const existing = readSettings(file);
  const backup = backupIfExists(file);
  const stripped = stripHooks(existing.hooks);
  const next = { ...existing, hooks: stripped };
  if (Object.keys(stripped).length === 0) delete next.hooks;
  writeSettings(file, next);
  process.stdout.write(`✓  Removed Kyntra hooks from ${file}\n`);
  if (backup) process.stdout.write(`✓  Backup saved → ${backup}\n`);
}

// ─── Dispatch ─────────────────────────────────────────

const cmd = process.argv[2] || 'install';
switch (cmd) {
  case '--help':
  case '-h':
  case 'help':
    usage();
    break;
  case 'print-config':
    printConfig();
    break;
  case 'install':
    install();
    break;
  case 'status':
  case 'check':
    await status();
    break;
  case 'uninstall':
  case 'remove':
    uninstall();
    break;
  case 'bridge':
    // Delegate to bridge.js when called as `kyntra-claude-hook bridge`
    await import('./bridge.js');
    break;
  default:
    process.stderr.write(`Unknown command: ${cmd}\n\n`);
    usage();
    process.exit(1);
}
