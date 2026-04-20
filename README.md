# @kyntra/claude-hook

[English](./README.md) · [한국어](./README.ko.md)

> **The harness-engineering layer of [Kyntra AIMOps Control Tower](https://kyntra.ai.kr)** — open-source client (MIT), patent-pending server.

Governance hooks for Claude Code. A deterministic rule engine + LLM judgement layer sits in front of every tool call and returns **allow / block / warn** in under a second — stopping destructive commands, hallucinated "done" reports, and soft-rule violations *before* they land.

```
$ claude
> fix the bug and push

[KYNTRA] BLOCKED — Force push to main/master branch is blocked
         Principle: rule-no-force-push-main
         Layer: rules
```

This is the open-source client adapter. It posts each hook event to Kyntra's server-side governance engine (patent-pending) over HTTPS and exits with the verdict.

## Who this is for

Kyntra fits when you:
- Keep catching Claude claiming "done" when the work isn't verified (the classic `curl OK → site broken` pattern).
- Want the rules in your `CLAUDE.md` **enforced**, not just *hinted* at once per session.
- Need force-push, `rm -rf /`, and bare-`wrangler deploy` blocking at the hook layer — before Claude shells out.
- Run multiple Claude Code users / projects and want per-account trust profiles and promotion candidates.

Not a fit if:
- You only need plain regex filters — a shell hook in `~/.claude/settings.json` is enough.
- Your workflow never touches destructive, deploy, or secret-bearing commands.
- You're air-gapped — Kyntra needs outbound HTTPS to `api.kyntra.ai.kr`.

---

## Why

You told Claude "follow my rules." You pasted a reminder into every session. You still got `curl OK — site is live` when the site was broken.

The problem isn't the model — reminders are *advisory*. Hooks are *enforcement*. Kyntra sits in front of every AI tool call and returns **allow / block / warn** in under a second.

- **Determinism first** — a built-in regex rule engine catches the obvious classes. No LLM calls, no cost, no latency.
- **LLM for the ambiguous rest** — Kyntra's Layer 2 (Haiku) handles contextual judgements your regex can't express.
- **Your rules, enforced** — register custom rules via the dashboard or import them from your CLAUDE.md.
- **Semi-automated principle evolution (human-in-the-loop)** — repeat violations accumulate into *promotion candidates*; reliable principles decay. Kyntra surfaces the candidates automatically but **you approve every promotion** — no silent rule changes. Trust-adjustment engine is patent-pending (KR claims 1 & 2).

## Kyntra vs. a DIY hook

If you're weighing **writing your own Claude Code hook** against this one, the honest tradeoff:

| Concern | DIY shell hook | Kyntra |
|---|---|---|
| Block `rm -rf /`, `git push --force main` | Regex does it | Same (Layer 1, <1 ms, zero API cost) |
| Catch "the deploy is done" *when it isn't* | Needs an LLM call you write | Built-in Layer 1 rule flags unverified completion claims; Layer 2 (Haiku) handles the ambiguous contextual cases |
| Turn `CLAUDE.md` rules into enforcement | Hand-port each rule to regex/prompt | Paste CLAUDE.md → Kyntra extracts enforceable rules |
| Trust signals — which rules actually fire, which are noisy | You build the dashboard | Dashboard + human-approved promotion candidates built-in |
| Maintenance when Claude Code changes event shapes | Yours | Server-side; the client stays ~200 lines |
| Cost | Your dev time, ongoing | $15/mo Starter · $29/mo Pro (14-day money-back) |

The harness stays open (MIT, ~200 lines — read every line before trusting it). The server engine (three-layer: KV cache → regex rules → Haiku LLM) is the part you'd otherwise have to build yourself.

## Install

```bash
npx @kyntra/claude-hook install
```

That registers the hook in `~/.claude/settings.json`, backs up any existing config, and gives you a copy-paste next-step. Then:

```bash
export KYNTRA_API_KEY=ky_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

…and restart Claude Code. Try `git push --force origin main` — it should be refused at the hook layer, before Claude even shells out.

## Get an API key

You need a Kyntra subscription. Plans start at **$15/month** with a **50% first-month discount** and a **14-day money-back guarantee**.

1. Go to **[app.kyntra.ai.kr](https://app.kyntra.ai.kr)** and sign in with GitHub
2. Subscribe to a plan (Starter or Pro)
3. Copy your API key from the dashboard

- **[Pricing](https://kyntra.ai.kr/pricing)** — Starter $15/mo, Pro $29/mo
- **[Terms](https://kyntra.ai.kr/terms)** · **[Privacy](https://kyntra.ai.kr/privacy)** · **[Refund](https://kyntra.ai.kr/refund)**

## Built-in rules

These rules run **before** any LLM call — zero cost, zero latency. They catch the most common destructive patterns out of the box:

| Rule | Verdict | What it catches |
|------|---------|-----------------|
| No force push to main | **BLOCK** | `git push --force main`, `git push -f master` |
| No recursive delete root | **BLOCK** | `rm -rf /`, `rm -rf ~`, `rm -rf $HOME` |
| No skipping git hooks | **BLOCK** | `git commit --no-verify`, `--no-gpg-sign` |
| No appending to .env | **WARN** | `echo >> .env` (accidental secret exposure) |
| No bare wrangler deploy | **WARN** | `wrangler deploy` without `npm run deploy` |
| Secret leak detection | **WARN** | API keys, tokens (`sk-`, `ghp-`, `eyJ`) in commands |
| Completion without verification | **BLOCK** | Claiming "done" without evidence of grep, test, or browser verification |

If none of these match, the event is forwarded to **Layer 2 (Haiku LLM)** for contextual analysis.

## Custom rules

Define your own governance rules that get enforced alongside the built-in ones. Your custom rules are injected into the LLM evaluation layer — they work with natural language, not just regex.

### Via the dashboard

1. Sign in at **[app.kyntra.ai.kr](https://app.kyntra.ai.kr)**
2. Go to **Custom Rules** in the sidebar
3. Click **+ Add Rule** or **Import from CLAUDE.md**

Each rule has:
- **Name** — short title (e.g., "Run lint before commit")
- **Description** — the full rule text the AI must follow
- **Category** — security, quality, workflow, or general
- **Severity** — critical (→ block), warning (→ warn), or info (→ allow with note)

### CLAUDE.md import

Paste your CLAUDE.md content and Kyntra's AI extracts actionable rules automatically. No manual entry needed — it parses your existing project instructions into enforceable governance rules.

### Limits

| Plan | Max rules |
|------|-----------|
| Starter ($15/mo) | 10 |
| Pro ($29/mo) | 50 |

## Environment

| Variable | Required | Default |
|---|---|---|
| `KYNTRA_API_KEY` | yes | — |
| `KYNTRA_ENDPOINT` | no | `https://app.kyntra.ai.kr/api/governance/check` |

## How it works

```
Claude Code session
  │
  │ 1. Tool call (Bash / Edit / Write / Stop)
  ▼
Hook: node bridge.js   ← this package (MIT, ~200 lines)
  │
  │ 2. POST /api/governance/check  {event, tool, command, ...}
  ▼
api.kyntra.ai.kr       ← server engine (closed-source, patent-pending)
  │
  │ 3. Layer 0 KV cache → Layer 1 rules → Layer 2 Haiku → verdict
  ▼
Hook: exit 0 (allow) | exit 2 (block)
```

**The client adapter holds zero principle logic.** It does three things: read stdin, POST to the Kyntra API, exit with the verdict. That's the entire source.

## Fail-open

If `api.kyntra.ai.kr` is unreachable or times out (5 s default), the hook exits **0 (allow)** with a note on stderr. Kyntra will never block legitimate work because of its own bugs or network issues.

## CLI

```bash
npx @kyntra/claude-hook install        # install hooks into ~/.claude/settings.json
npx @kyntra/claude-hook uninstall      # remove them
npx @kyntra/claude-hook print-config   # print the hook snippet for manual setup
npx @kyntra/claude-hook --help
```

## Manual setup

If you prefer to edit `~/.claude/settings.json` yourself:

```bash
npx @kyntra/claude-hook print-config
```

…and merge the output into your existing `hooks` key.

## What Kyntra actually sees

For every tool call the hook sends:

- `event_type` — `pre_tool_use` / `post_tool_use` / `stop` / …
- `tool` — `Bash` / `Edit` / `Write` / …
- `command` — first 800 chars of the command string (Bash only)
- `file_path` — the path of the file being edited
- `response_text` — for Stop events, first 1,500 chars of the assistant's last message

That's it. **Source code contents, repository listings, secrets, or environment variables are never sent.** Full details in the [Privacy Policy](https://kyntra.ai.kr/privacy).

## License

MIT — see [LICENSE](./LICENSE).

> The MIT license covers this client adapter only. The server-side governance engine at `api.kyntra.ai.kr` is proprietary to Flowlabs and protected under Korean patent application (claims 1 and 2 cover the compliance verification engine and trust-adjustment engine respectively).

## Contact

- Homepage: https://kyntra.ai.kr
- App: https://app.kyntra.ai.kr
- Issues: https://github.com/YBPartners/kyntra-claude-hook/issues
- Email: contact@kyntra.ai.kr

---

*Built by [Flowlabs](https://kyntra.ai.kr). Made because I was tired of Claude telling me the deploy was "done" when it wasn't.*
