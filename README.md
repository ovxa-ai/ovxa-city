<div align="center">

<img src="docs/city-multi.png" alt="OVXA City: every AI agent in one isometric city" width="100%">

# OVXA City

**Every AI agent. One city.**

OpenAI, Grok Bot, Claude / MCP, OpenClaw, Muse, LangChain, CrewAI, n8n and your own bots report to **one endpoint** and live on **one map**. Districts by platform, towers grow with activity, live feed, hand-offs drawn between agents.

[Integrations](docs/INTEGRATIONS.md) · [Quickstart](#-quickstart) · ⭐ [Star OVXA](https://github.com/ovxa-ai)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ovxa-ai/ovxa-city)

</div>

---

https://github.com/ovxa-ai/ovxa-city/raw/main/docs/hero-multi.mp4

<img src="docs/hero-multi.gif" alt="27 agents from 10 platforms joining the city" width="100%">

## ⚡ Quickstart

1. **Deploy** with the button above (set a password). Open your city → **Connect an agent** → **Generate join token**.
2. **Send one request** from any agent:

```bash
curl -X POST https://<your-city>.workers.dev/api/v1/agents \
  -H "Authorization: Bearer <JOIN_TOKEN>" -H "content-type: application/json" \
  -d '{"agent":{"id":"my-agent","name":"My Agent","platform":"openai"},"status":"busy","task":"Drafting the weekly report"}'
```

3. Watch it move in. That's it. Chat-only bots: paste the **Prompt** tab. MCP clients: add `https://<your-city>.workers.dev/mcp`.

## Integrations

| Platform | How | |
|---|---|---|
| OpenAI Agents SDK / Assistants | function tool or remote MCP | [guide](docs/INTEGRATIONS.md#openai-agents-sdk--assistants) |
| ChatGPT GPTs | Action (OpenAPI schema) | [guide](docs/INTEGRATIONS.md#chatgpt-gpts-actions) |
| Grok Bot | paste prompt → routine | [guide](docs/INTEGRATIONS.md#grok-bot) |
| Claude / MCP clients | `/mcp` → `city_report` tool | [guide](docs/INTEGRATIONS.md#claude--any-mcp-client) |
| OpenClaw | MCP or curl hook | [guide](docs/INTEGRATIONS.md#openclaw) |
| Muse | webhook step | [guide](docs/INTEGRATIONS.md#muse) |
| LangChain / LangGraph | callback handler or MCP adapter | [guide](docs/INTEGRATIONS.md#langchain) |
| CrewAI | `step_callback` | [guide](docs/INTEGRATIONS.md#crewai) |
| n8n | HTTP Request node | [guide](docs/INTEGRATIONS.md#n8n) |
| Anything with HTTP | `POST /api/v1/agents` | [guide](docs/INTEGRATIONS.md#custom--anything-else) |

## How the city works

- **Districts** per platform, neutral colors, no logos. **Tower height** grows with the last 24 h of activity.
- **Live feed** of joins, status changes, errors and **hand-offs** (`"handoff":{"to":"<id>"}` draws an arc).
- **Health:** stale after 15 min without a report, offline after 6 h.
- `?demo` shows simulated agents; the original Grok Bot Town Hall with approvals lives at `?classic`.
- Auth: per-agent join tokens (hashed in KV) or a shared `CITY_KEY` secret. Old `/api/status` bot tokens keep working.

## Develop

```bash
npm install && npm run dev     # app + worker
npm test && npm run build
python3 scripts/video.py       # re-record docs/hero-multi.mp4/.gif (needs vite preview on :4173)
```

---

# Classic mode (Grok Bot + Town Hall approvals)

Open `/?classic`. The original setup below still works unchanged.

## Honest limits

- **There's no public Grok Bot API.** OVXA City doesn't read your bots. Your bots push their status to it through a **scheduled routine**.
- **Approvals only cover what your routine reports.** Grok Bot's built-in in-app approval cards can't be answered from here.
- A decision reaches a bot only if that bot has a routine webhook configured.
- Without a backend, the page runs in **demo mode** with clearly labeled sample data.

## Paste this to your bot

`npm run setup` prints a `CITY_URL`, `BOT_ID` and `BOT_TOKEN` for each bot. Send each Grok Bot this message with its own values filled in:

```text
Set up OVXA City reporting for yourself. Create two routines:

1) "OVXA City status": scheduled every 15 minutes. It sends
   POST {CITY_URL}/api/status
   Header: Authorization: Bearer {BOT_TOKEN}
   Body: {"status":"ok|busy|error|idle","message":"<one short line on what you're doing>",
          "pending":[{"id":"<stable id>","title":"<action awaiting my approval, under 140 chars>",
                      "detail":"<optional>","kind":"email|post|purchase|other","created_at":"<ISO time>"}]}
   "pending" lists ONLY actions you're holding for my approval. Never put secrets, passwords,
   message bodies or personal data in title/detail. Keep each id stable across pushes, and
   remove an item once it's done. Save BOT_TOKEN as a secret, not in the prompt text.

2) "OVXA City decisions": triggered by a webhook. On a request
   {"request_id":"...","decision":"approve"|"decline"} that carries the correct webhook key,
   find that held action. If approve: do exactly that action. If decline: drop it.
   Ignore unknown ids or a wrong key. Then run the status routine once.

When you're done, send me the webhook URL and the webhook key of routine 2, and tell me where
in the routine settings I can copy them from. Don't run anything else.

CITY_URL={CITY_URL}
BOT_ID={BOT_ID}
BOT_TOKEN={BOT_TOKEN}
```

The bot replies with its webhook URL and key, which you copy from that routine's webhook trigger settings. Attach them like this:

```bash
npm run setup -- webhook <BOT_ID> <WEBHOOK_URL> <WEBHOOK_KEY>
```

Your decisions in Town Hall now reach that bot. More prompt variants are in [docs/ROUTINES.md](docs/ROUTINES.md).

<details><summary>Manual setup (no script)</summary>

```bash
npm install && npm run deploy                 # KV namespace is auto-created (no id in wrangler.toml)
npx wrangler secret put OWNER_PASSWORD
npx wrangler secret put SESSION_SECRET        # openssl rand -hex 32
npx wrangler secret put BOTS                  # JSON below
```

```json
{
  "chief":  { "name": "Chief of Staff", "role": "chief",  "token": "<random>", "webhook": "https://…", "webhookKey": "<from routine>" },
  "grok":   { "name": "Grok Bot",       "role": "router", "token": "<random>" }
}
```

**Prefer Cloudflare Access?** Protect the route with Access and set `ACCESS_EMAIL` in `wrangler.toml`.
</details>

## API

| Route | Who | What |
|---|---|---|
| `POST /api/status` | bot (`Bearer <token>`) | `{status, message, pending:[{id,title,detail,kind,created_at}]}` |
| `GET /api/state` | anyone / owner | bots and statuses. `pending` and the log are returned to the owner only |
| `POST /api/decision` | owner | `{bot_id, request_id, decision}` is forwarded to the bot's webhook as `{request_id, decision}` |
| `POST /api/login` · `/api/logout` · `GET /api/me` | owner | password session (HMAC-signed, HttpOnly, SameSite=Strict) |

An item is removed only after the bot's webhook accepts the decision. Decided IDs are remembered, so a late status push can't bring them back. Inputs are size-capped and validated, and login and decision requests are origin-checked.

## Develop

```bash
npm run dev          # frontend with demo data, http://localhost:5173/?demo
cp .dev.vars.example .dev.vars && npm run build && npm run worker:dev   # full stack
npm test             # Worker tests (vitest)
```

Deploying only the frontend to Cloudflare Pages? Build with `VITE_API_BASE=https://your-worker.example`.

<table><tr><td><img src="docs/mobile.png" alt="Mobile" width="260"></td><td><img src="docs/night.png" alt="Night"></td></tr></table>

<a name="demo"></a>
## Built with OVXA

OVXA is **the UI Intelligence Engine for Generative UI**. If this made you smile, **[⭐ star ovxa-ai](https://github.com/ovxa-ai)** so more people find it.

MIT © OVXA
