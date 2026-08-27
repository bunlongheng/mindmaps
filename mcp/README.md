# mindmaps MCP server

Exposes the Mindmaps app (`mindmaps-bheng.vercel.app`) to any MCP-capable agent
(Claude Code, Claude Desktop, etc.) as structured tools, so a local agent can
create mind maps without hand-rolling `curl` + JSON escaping.

It is a **thin wrapper over the app's public render-only endpoint**
(`POST /api/ai/mindmaps`) — it does not touch the database and **never spends
Anthropic credits**. The agent writes the outline; the app just renders it. All
validation stays in the route handler, so the MCP path can't drift.

> One of three sibling MCP servers — **diagrams** (sequence diagrams),
> **system-design** (AWS/GCP node-edge), **mindmaps** (this one). Different app,
> API, and store each. Never mix them.

## Tools

| Tool | What it does |
|------|--------------|
| `create_mindmap` | Create a map from an outline you write → `{ id, url, nodeCount }` |
| `get_mindmap_schema` | The exact shape + outline format + a complete example |

Only create + schema are exposed: the Mindmaps CRUD API (`/api/mindmaps`) is
signed-session-only, so a static Bearer can't list/read/delete. Creation is the
public contract.

## Env

- `MINDMAP_AI_API_KEY` — **required**. Bearer for the render-only endpoint. On the
  primary workstation it's exported from `~/.zshenv`; `load-env.mjs` falls back to
  this repo's `.env.local`.
- `MINDMAP_USER_ID` — optional. Owner id so maps show in the home list (defaults to
  the known owner id).
- `MINDMAP_APP_URL` — optional. Defaults to `https://mindmaps-bheng.vercel.app`.

## Register

```bash
claude mcp add mindmaps -s user -- node /Users/bheng/Sites/mindmaps/mcp/server.mjs
```

Verify with `claude mcp list` (should show `✔ Connected`).

## Cloud / headless note

This is a local stdio server — a remote cloud agent or scheduled routine has no
such process. There, use the HTTP API directly (`POST /api/ai/mindmaps` with the
Bearer). That's why the `/create-mindmap` skill keeps the `curl` path as a
fallback: MCP for local, curl for cloud.
