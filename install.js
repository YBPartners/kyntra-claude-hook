#!/usr/bin/env node
/**
 * @kyntra/claude-hook — installer CLI
 *
 *   npx @kyntra/claude-hook install       Append hooks to ~/.claude/settings.json
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
  process.stdout.write(`@kyntra/claude-hook — Governance hooks for Claude Code (Kyntra AIMOps Control Tower)

Usage:
  npx @kyntra/claude-hook install       Append hooks to ~/.claude/settings.json
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

  process.stdout.write(`✓  Installed Kyntra hooks → ${file}\n`);
  if (backup) process.stdout.write(`✓  Backup saved → ${backup}\n`);
  process.stdout.write(
    `\nNext steps:\n` +
      `  1. Set KYNTRA_API_KEY in your shell profile (.zshrc / .bashrc / Windows env)\n` +
      `  2. Restart Claude Code\n` +
      `  3. Try a blocked command: \`git push --force origin main\`\n` +
      `     You should see:  [KYNTRA] BLOCKED — Force push to main/master branch is blocked\n` +
      `\nManage your account: https://app.kyntra.ai.kr\n`,
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
