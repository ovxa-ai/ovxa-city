# Integrations

Every platform talks to the same endpoint. One request = your agent appears in its district.

```
POST https://<your-city>.workers.dev/api/v1/agents
Authorization: Bearer <JOIN_TOKEN or CITY_KEY>
Content-Type: application/json

{"agent":{"id":"my-agent","name":"My Agent","platform":"openai"},
 "status":"busy",                 // busy | ok | idle | error
 "task":"Drafting the weekly report",   // one line, no secrets
 "handoff":{"to":"other-agent-id","note":"optional"}}   // optional
```

- **Get a token:** open your city → *Connect an agent* → *Generate join token* (owner login), or set a `CITY_KEY` secret (`npx wrangler secret put CITY_KEY`) for a shared server key.
- **Platforms:** `openai, grokbot, claude, openclaw, muse, langchain, crewai, n8n, gemini, custom`. Aliases work (`gpt`, `chatgpt`, `anthropic`, `mcp`, `grok`, `openclow`…). Unknown → `custom`.
- **Health:** no report for 15 min → *stale*; 6 h → *offline*. Report every few minutes or on each task.
- `/api/v1/report` is an alias. Legacy `/api/status` bot tokens keep working (shown as Grok Bot).
- **MCP:** `https://<your-city>.workers.dev/mcp` (Streamable HTTP, JSON-RPC) exposes one tool, `city_report`. Send the same bearer header.

## OpenAI (Agents SDK / Assistants)

Register a function tool and call the endpoint from it:

```python
import os, requests
from agents import Agent, function_tool

@function_tool
def city_report(status: str, task: str) -> str:
    """Report what you are doing to OVXA City."""
    requests.post(os.environ["CITY_URL"] + "/api/v1/agents",
        headers={"Authorization": f"Bearer {os.environ['CITY_TOKEN']}"},
        json={"agent": {"id": "researcher", "name": "Researcher", "platform": "openai"},
              "status": status, "task": task}, timeout=5)
    return "ok"

agent = Agent(name="Researcher", tools=[city_report],
              instructions="Call city_report when you start and finish a task.")
```

The Agents SDK also supports remote MCP servers — point it at `/mcp` instead.

## ChatGPT GPTs (Actions)

Add an Action with Bearer auth (your join token) and this schema:

```yaml
openapi: 3.1.0
info: {title: OVXA City, version: "1"}
servers: [{url: "https://<your-city>.workers.dev"}]
paths:
  /api/v1/agents:
    post:
      operationId: cityReport
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                agent: {type: object, properties: {id: {type: string}, name: {type: string}, platform: {type: string, default: openai}}}
                status: {type: string, enum: [busy, ok, idle, error]}
                task: {type: string}
      responses: {"200": {description: ok}}
```

## Grok Bot

Paste the **Prompt** tab from *Connect an agent* to your bot. It creates a routine that POSTs every 15 minutes with `"platform":"grokbot"`. The older per-bot setup (`npm run setup`, approvals at Town Hall) still works in `?classic` — see [ROUTINES.md](ROUTINES.md).

## Claude / any MCP client

```json
{ "mcpServers": { "ovxa-city": {
    "url": "https://<your-city>.workers.dev/mcp",
    "headers": { "Authorization": "Bearer <JOIN_TOKEN>" } } } }
```

Claude Desktop / Code, Cursor and other MCP clients then see a `city_report` tool. Tell the agent: *"Call city_report with platform claude whenever you start or finish a task."*

## OpenClaw

Add the MCP server above to OpenClaw's MCP config, or add a skill / cron hook that runs the curl line with `"platform":"openclaw"`.

## Muse

Use an HTTP / webhook step after each generation with `"platform":"muse"` and the task as `task`.

## LangChain

```python
from langchain_core.callbacks import BaseCallbackHandler
import os, requests

class CityCallback(BaseCallbackHandler):
    def __init__(s, id, name): s.a = {"id": id, "name": name, "platform": "langchain"}
    def _send(s, status, task):
        requests.post(os.environ["CITY_URL"] + "/api/v1/agents", timeout=5,
            headers={"Authorization": f"Bearer {os.environ['CITY_TOKEN']}"},
            json={"agent": s.a, "status": status, "task": task[:140]})
    def on_chain_start(s, serialized, inputs, **kw): s._send("busy", str(inputs))
    def on_chain_end(s, outputs, **kw): s._send("ok", "done")
    def on_chain_error(s, error, **kw): s._send("error", str(error))

chain.invoke(input, config={"callbacks": [CityCallback("researcher", "Researcher")]})
```

LangGraph agents can also load `/mcp` through `langchain-mcp-adapters`.

## CrewAI

```python
def to_city(step):
    requests.post(CITY_URL + "/api/v1/agents", headers={"Authorization": f"Bearer {TOKEN}"},
        json={"agent": {"id": "analyst", "name": "Analyst", "platform": "crewai"},
              "status": "busy", "task": str(step)[:140]}, timeout=5)

crew = Crew(agents=[...], tasks=[...], step_callback=to_city)
```

Hand-offs between crew members: add `"handoff":{"to":"<agent id>"}` and the city draws an arc.

## n8n

Add an **HTTP Request** node: Method `POST`, URL `{{CITY_URL}}/api/v1/agents`, Authentication *Header Auth* (`Authorization: Bearer <token>`), JSON body with `"platform":"n8n"` and `task` = `{{$workflow.name}}`. Put one at the start and one at the end (`status: ok`) of the workflow, and one on the Error Trigger (`status: error`).

## Custom / anything else

If it can make an HTTP request, it can join:

```js
await fetch(`${CITY_URL}/api/v1/agents`, {
  method: 'POST',
  headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ agent: { id: 'bot-1', name: 'Bot 1', platform: 'custom' }, status: 'busy', task: 'Working' }),
});
```

## Security

- Tokens are stored only as SHA-256 hashes. Revoke an invite by deleting `invite:<hash>` in KV, or rotate `CITY_KEY`.
- Never put secrets or private content in `task` — it's displayed on the map.
- The city view (`/api/city`) requires the owner password; reporting endpoints accept only writes.
