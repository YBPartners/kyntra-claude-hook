# @kyntra/claude-hook

Real-time AI agent governance for Claude Code. Enforce your coding principles via hooks — block destructive commands, catch false "complete" reports, and get warned on soft violations before they land.

```
$ claude
> fix the bug and push

[KYNTRA] BLOCKED — Force push to main/master branch is blocked
         Principle: rule-no-force-push-main
         Layer: rules
```

This is the open-source client adapter. It communicates with Kyntra's server-side governance engine (patent-pending) over HTTPS.

---

## Why

You told Claude "follow my rules." You pasted a reminder into every session. You still got `curl OK — site is live` when the site was broken.

The problem isn't the model — reminders are *advisory*. Hooks are *enforcement*. Kyntra sits in front of every AI tool call and returns **allow / block / warn** in under a second.

- **Determinism first** — a built-in regex rule engine catches the obvious classes (`rm -rf /`, `git push --force main`, `git commit --no-verify`, `echo >> .env`, "done without grep verification"). No LLM calls, no cost, no latency.
- **LLM for the ambiguous rest** — Kyntra's Layer 2 (Haiku) handles contextual judgements your regex can't express.
- **Self-evolving principles** — repeat violations bubble up; reliable principles decay. Kyntra's trust-adjustment engine is patent-pending (KR claims 1 & 2).

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

- **[Pricing](https://kyntra.ai.kr/pricing)** — Starter $15/mo, Pro $29/mo
- **[Terms](https://kyntra.ai.kr/terms)** · **[Privacy](https://kyntra.ai.kr/privacy)** · **[Refund](https://kyntra.ai.kr/refund)**

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
