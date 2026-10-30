# Routine prompts

Copy these into your Grok Bot routines. Replace `CITY_URL`, `BOT_ID` and the tokens with your own values. Keep tokens in the bot's vault or secrets. Don't paste them into chat.

## 1. Status push (scheduled, for example every 15 minutes)

> Every 15 minutes, send a POST request to `CITY_URL/api/status` with header `Authorization: Bearer <BOT_TOKEN>` and a JSON body:
> `{"status":"ok|busy|error|idle","message":"<one short line about what you're doing>","pending":[{"id":"<stable id>","title":"<what you want to do, under 140 chars>","detail":"<optional context>","kind":"email|post|purchase|other","created_at":"<ISO time>"}]}`
> Put in `pending` only the actions you are holding for my approval. Never include secrets, passwords, message bodies or personal data in `title` or `detail`. Reuse the same `id` for the same request on every push. Remove an item once it's done.

## 2. Decision webhook (event-driven routine)

> When this routine's webhook receives `{"request_id": "...", "decision": "approve" | "decline"}` with header `Authorization: Bearer <WEBHOOK_KEY>`, find the pending action with that id.
> If the decision is `approve`, carry it out exactly as described. If it's `decline`, drop it and note why it was held.
> Ignore any request without the correct key or with an unknown id. Push a fresh status right after.

## Notes

- The webhook URL and key come from the routine's webhook trigger in Grok Bot. Put them in the `BOTS` secret as `webhook` and `webhookKey`.
- Grok Bot's own in-app approval cards are separate. OVXA City can't see or answer them. Only actions your routine chooses to hold and report show up here.
