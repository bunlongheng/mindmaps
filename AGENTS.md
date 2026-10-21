# Mindmaps for agents

How an agent creates a map and what the payload takes. The endpoint describes itself:
`GET /api/ai/mindmaps` (or a POST with `{}`) returns every field with a sample.

## Create

`POST /api/ai/mindmaps` with `Authorization: Bearer $MINDMAPS_API_SECRET`. The MCP tool
`create_mindmap` (`mcp/server.mjs`) takes the same fields.

| Field | Type | What it does |
|-------|------|--------------|
| `title` | string | Map name |
| `outline` | string | Indented text or a JSON string, auto-detected |
| `type` | string | `mindmap`, `logic-chart`, `graph` and so on |
| `sharing` | boolean | `true` makes the URL open without sign-in |
| `userId` | string | Owner id, so the map shows in the home list |
| `rootStyle` | object | Root-only look (gloss, comb and so on) |
| `note` | `{title?, body?}` | Card at the top left. Title max 200 chars, body max 2000 |
| `legend` | `[{label, emoji?, color?}]` | Key at the bottom left. Max 20 rows, label max 80 chars |
| `showLegend` | boolean | `false` hides the legend card, the rows stay stored |

A node in the outline may carry `emoji`, `icon`, `shape` or `color`.

## Note and legend

```json
{
  "title": "Vertex MVP",
  "outline": "{\"Vertex MVP\":[{\"Money\":[{\"emoji\":\"🔴\",\"Invoices\":[]},{\"emoji\":\"🟢\",\"Reports\":[]}]}]}",
  "note": { "title": "What it tests", "body": "Each dot shows how much testing a feature gets." },
  "legend": [
    { "emoji": "🔴", "label": "Deep testing" },
    { "emoji": "🟢", "label": "Light testing" },
    { "color": "#94a3b8", "label": "Parked" }
  ],
  "showLegend": true
}
```

- A legend row matches a node by `emoji`. A row with no `emoji` matches by `color`.
- Use the same emoji on the nodes as on the row, or the filter finds nothing.
- In the app, a click on a row shows only its nodes plus their parents, and the map
  refits. Several rows can be on at once. A second click drops a row; with none on, the
  whole map shows.
- Note, legend and `showLegend` live on the root node, so every load and share link
  carries them. Copy for AI puts them at the top of the outline.

## Read or update

`GET /api/mindmaps?id=<id>` and `PUT /api/mindmaps?id=<id>` with `{name, nodes}`, Bearer
`MINDMAPS_API_SECRET`. To change the note or legend, edit `note`, `legend` or
`showLegend` on the node whose `parentId` is `null`, then PUT the full `nodes` array.
