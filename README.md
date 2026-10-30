<div align="center">

<img src="docs/desktop.png" alt="OVXA City: your AI bots as a floating isometric city" width="100%">

# OVXA City

**Your AI bots, as a living city.** Every bot gets a building. Anything risky waits at Town Hall until you approve it.

[Live demo (sample data)](#demo) · [60-second quickstart](#-60-second-quickstart) · [Routine prompts](docs/ROUTINES.md) · ⭐ [Star OVXA](https://github.com/ovxa-ai)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ovxa-ai/ovxa-city)

</div>

---

<img src="docs/hero.gif" alt="Approving a request and switching to night" width="100%">

## ⚡ 60-second quickstart

**Option A, one click.** Press **Deploy to Cloudflare** above. Cloudflare copies the repo, creates the KV store, builds the app and deploys it. Set a password when it asks. You can leave `BOTS` as `{}` for now.

**Option B, terminal (recommended).** This also generates your bot tokens:

```bash
git clone https://github.com/ovxa-ai/ovxa-city && cd ovxa-city
npm install
npm run setup        # asks for bot names → sets secrets → deploys → prints what to paste to each bot
```

Then paste the [bot prompt](#paste-this-to-your-bot) into each Grok Bot. That's the whole setup.

## What it is

- **A city of your bots.** Buildings are config-driven. Your chief of staff takes the tower, your router takes the dish, and the rest move into the offices. A new bot shows up as a crane on the construction lot.
- **Town Hall.** A single queue of actions your bots are holding for you. Approve or decline, and the decision goes straight to that bot's webhook.
- **Day and night.** Real window lights, cars with headlights, reduced-motion support, keyboard navigation and a mobile bottom sheet.
- **English and Hebrew (RTL)** out of the box. Add a language in `src/i18n.ts`.
- **Share my city.** One click exports a PNG of your skyline with your bot names. It never includes request contents.

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
