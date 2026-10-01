# <img src="docs/icon.png" width="36" height="36" align="top" alt=""> Mindmaps

Mind maps an agent can draw and a README can embed.

Give it a title and an outline, get a laid-out map back: 6 diagram shapes over 1 node model, so the same outline is a logic chart, a radial mind map, a graph, a fishbone, a timeline or a honeycomb with 1 click. Every map is a row in Postgres, and the same row renders back out as JSON or a self-contained SVG from a plain URL - so the picture in your docs is the map, not a screenshot of one that drifted 3 commits ago. Plain-English generation ships inside, owner-only, so nobody else can spend your Anthropic credits.

![The Mindmaps library: 12 showcase maps across all 6 shapes, each card a live render of the stored map](docs/screenshots/hero.webp)

[![CI](https://github.com/bunlongheng/mindmaps/actions/workflows/ci.yml/badge.svg)](https://github.com/bunlongheng/mindmaps/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-4169E1?logo=postgresql&logoColor=white)
![Tests](https://img.shields.io/badge/tests-1244%20unit%20%2B%20151%20e2e-34C759)

**Live:** [mindmaps-bheng.vercel.app](https://mindmaps-bheng.vercel.app) &middot; **Demo wall:** [/?tab=demo](https://mindmaps-bheng.vercel.app/?tab=demo)

## Features

- **6 shapes, 1 outline** - logic chart, mind map, graph, fishbone, timeline, honeycomb. Switch shape and the same nodes re-lay themselves out.
- **It places itself** - positions are computed by a pure layout engine on every change, never hand-maintained, so data and geometry cannot drift.
- **A map is a URL** - the same row as JSON or SVG. New maps are private until you share them.
- **It looks finished** - 4 themes, 3 line styles, 4 box shapes, per-branch colour gradients, 155 icons and an emoji picker, gloss, mesh or web honeycombs.
- **Built to present** - 30-step undo, snap guides, multi-select, zoom from 2% to 1000%, share link with QR code, Open Graph card, PDF export.
- **Offline first** - every map mirrors to localStorage for an instant open and syncs to Postgres on a debounce. Installable PWA.
- **3 ways in** - the canvas, an HTTP API with a token, or the MCP server. Paste an outline anywhere on the home page and it becomes a map.

## Read this before you clone

This is a working app, not a library. It needs 3 things from you, and 1 more if you want the AI part.

| You provide | Why | Free option |
|---|---|---|
| **Postgres** | Every map is a row here, no SQLite fallback | Neon, Supabase, Railway |
| **Google OAuth** | The only sign-in, 1 owner email | Google Cloud Console |
| **A host** | Vercel serverless functions behind a Vite SPA | Vercel, or localhost |
| **Anthropic key** | Plain-English generation only | optional |

## For agents

1 Bearer-authed POST returns a URL. The outline is indented text or a JSON string, auto-detected; a node may carry `emoji`, `icon` or `shape`, and the root may carry a `rootStyle`. It is render-only: no model is called, so it costs 0 Anthropic credits.

```bash
curl -X POST "$APP/api/ai/mindmaps" \
  -H "Authorization: Bearer $MINDMAP_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"System Design Basics","type":"logic-chart","lineStyle":"curved","sharing":true,
       "outline":"System Design Basics\n  Requirements\n    Functional\n    Non-functional\n  Data\n    Schema\n    Caching"}'
```

The `201` carries `url`, `svg_url` and `nodeCount`. Once it is shared, the SVG URL is the image - no auth, no browser:

```markdown
![System Design Basics]($APP/api/mindmaps?id=<id>&format=svg)
```

## Quick start

```bash
git clone https://github.com/bunlongheng/mindmaps.git
cd mindmaps
cp .env.example .env.local         # DATABASE_URL, Google OAuth, MINDMAP_AUTH_EMAIL, MINDMAP_AI_API_KEY
npm install
npm run migrate                    # applies db/migrations to a fresh database
npm run dev                        # http://localhost:5173
```

`npm test` runs 1244 unit tests, `npm run test:e2e` runs 151 Playwright tests. `node scripts/seed-demos.mjs` fills the Demos tab with the 12 showcase maps.

## Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_CA_CERT` | Postgres connection. The CA cert verifies TLS on a remote host |
| `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID` | Google OAuth client, for the button and for verifying the ID token at `/api/auth` |
| `MINDMAP_AUTH_EMAIL`, `MINDMAP_USER_ID` | The 1 account that can sign in, and the id its maps are stored under |
| `MINDMAP_JWT_SECRET` | Signs the 24-hour session token. `openssl rand -hex 32` |
| `MINDMAP_TOKEN_MIN_IAT` | Optional unix timestamp. Set it to now to revoke every outstanding session |
| `MINDMAP_AI_API_KEY` | Bearer for `POST /api/ai/mindmaps`, the CRUD API and the MCP server. Server-only |
| `ANTHROPIC_API_KEY` | Plain-English generation only. Leave unset to disable it |
| `MINDMAP_APP_URL` | Absolute links in responses and the CORS allow-origin |

`VITE_DEV_USER_*` signs the owner in automatically on localhost and is stripped from the production bundle.

## API

| Route | Auth | Returns |
|---|---|---|
| `POST /api/ai/mindmaps` | Bearer | A new map, with `url`, `svg_url` and `nodeCount`. Render-only |
| `POST /api/ai/generate-mindmap` | Owner session | A new map written by Claude from a prompt. The Bearer key is rejected here |
| `GET /api/mindmaps?id=` | Public if shared | JSON, or `?format=svg` |
| `GET /s/:id` | Public if shared | Share page with Open Graph card |
| `GET /api/health` | Public | 200 when the env is set and the database answers, 503 otherwise |

**MCP.** `mcp/server.mjs` exposes `create_mindmap` and `get_mindmap_schema` over stdio. Register it with your agent and point `MINDMAP_AI_API_KEY` at your deployment. See [mcp/README.md](mcp/README.md).

## Contributing

Issues and pull requests are welcome. Run `npm run lint`, `npm test` and `npm run test:e2e` before opening one.

## License

[MIT](LICENSE) (c) Bunlong Heng

---

<div align="center">

<a href="https://bunlongheng.com"><img src="https://img.shields.io/badge/-bunlongheng.com-3A3A3C?style=for-the-badge&amp;labelColor=2A2A2C&amp;logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y%2BmAAADAFBMVEXx8vLq6v%2F19fX09PT8%2Ff309PT5%2BfnAwMBMaXHx8vL19fX5%2Bfny8vL09PT39%2Ff6%2Bfn6%2Bvr09PTx8fH4%2BPn%2F8vLy8%2FP09PTz8%2FPy8vL%2F%2F%2F%2Fz9PTz9PP19fby8vP19PXz8%2FT19%2Fb08%2FTx8vLy8vL09vby8%2FL29vf19fTv8PDz9vb7%2Bvn%2F%2Ff%2F9%2Ff3w8vH29fb%2F%2FP339%2Ff5%2Bfn59%2Ff19PT09PR7rao3VF3%2F%2Fv8AKDR6sqsBV1vv8fL4%2BPiux8b8%2Bvq90NDy8%2FR%2BlpppnZyZqrACLTxclZJSkI9en5ssZ2luqaUAeWgqbW4BX1gCfG0%2Fa3QaVG0MN0UKNUKUpKsGpYMAKjoRQ1UDf3AQRloJqIgEm32d0cUBg3ElbnQIln8eVWgrmIdP0KzF5d5s2acdfHwppJCP5MMXl4Tz8%2FLv8%2FP39%2FiewL5%2BqahYf4IrTFZkk5KlxsREiIYAHiqDnKFmnJowc3IdVllvpKK7zc3D2tnk5%2BmuycdwpKKuub2yv8Ly%2B%2FkAMT7z%2Bvjq7e09gH93q6kGdWpGgoJZmJSlw8M7c3WwyceTw76w1M8mYmpFfX8lW2AFOEpGiYhxqqRrqaRb2rdIsZ8AVE91jpU7d3t3saqBoKhako4AWVEcUlg3aWwDupAHb2YwmIkPP1ERSVA7WmZ8tq8HT14oZW%2BYuLsMl3wQT10ROksENUc8Z3MJSGVLh4dqpJ%2BXr7U51awUgHM4v6ad1MkPuJZAiowVd3IEhnZH0aoYrI05p5sDtYwkzZ8EPViYxsRel5USbHAIgmwIM0gQamzU4uF2malQi4oWQFQ1zaYrp4UXlYwfiHoyxqFE1q4qeX4yn5JIxKkdrX1b1rAbWGvd5Oh91sRijpomsJEVc3Ukc34dqIcwuJVKwZIXkoQZcXlNv5g%2BqZUZvpNl2rPG9N0WkIoNqouW4sVPwp%2BM0b6h0ssfq4d%2F1r8hpo%2Fh9e4AamUjnI9avaBixqgklYWSwL4xtItUxplYl5qZ58mq78wMgnYXfnlOmJaR1L%2Bj78ny9fS%2FrXQPAAAAFXRSTlP7Brvx%2FsJhAgD87r4U72C4uGH8vhRDodYHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAC6UlEQVQokS2Sd3BUVRSHb0KS3QRCiZw5t%2By9j33zXjZkyUs2uekhEAi9dwRCL4JUEQRFAQUs9A4WOopKU0GpFoqCBZUivaqoFKkWLIS5GX7%2FfnPO78yZj%2Fj8UTViK6HggvNgSGuluEZRKbZqlN9H%2FFWiWUzIFQK5fhjOIRTDoqv4ia86S4q3KSByHdSqIhxofBKr5iNxLMm2bQqWVkorJ%2BAkO46nkQJhceSRmCTDvKJIJBLJzMxMLU6POJ4eBPF1KpNEbdt2Cms4LCcnZ%2FX6D3d%2BsKJJ7VSlNLoqgbjUtmkKKxlVmpf3bsFXW3d1b77gueJAQIPQBCilkMKemNi23Ts9T35%2FaMe2rsvmTypylGUFCSIYWJLXrm2nUwOPfNO5w%2B73Okxnjqe0JigQEL3JizoeONr%2F2u99vju4fd1rdZnyspQmnGvAUBprWNqz348%2FhXN%2F6P1%2By4Uvs%2FJkpRQRwpJBRVn7vf16Dfitz5XevQqWt3yalXtKaRIUQmglWfsu5y7%2BMrDs0TMftWo1ZVy64xioOVpcIdt8%2Fvqvf9%2F859KJsrLmrzA%2BOKC0IkFEtJza7JOfr%2FYd0P9G98tdOxe0Hp9qJrOIBgDuOeEtp%2F%2B4d%2FvWX%2F%2F9u%2B%2FtlaUTmOWZg7SQEEyuFe52%2BML9O3cZO%2F5xl06zn2VcadOJUqJTzt7a82XfP7sx9vmGNm1m1MstV4IHCVAAoTLqL1372ddn%2Fz%2B2v%2FWq12c1fSpsaeQWAZAANntxzuI3e3zbo8XGpm%2FMnNqiXrh%2BljaPd6UUabkjps19tdGnX2zKb9b4pTFDCzOMLmYtpW5h%2BpCRTeYtyV%2BT36zx808OL4xYGoFrkqDTbJpSXLdRgwbPZL%2BQnT129OOPFVEEsAMJpHKdeKMJgJSAiALdjJANQKnRJI4R6boAKEwLCiGoBBegQjBftQo1KQWOlplFKSV9qGaF1NpAE7QQESTlMSy6pp%2F4%2FFFVYxMNRBTaiM0tkImxNaL8vgfDR8gvoYRaxgAAAABJRU5ErkJggg%3D%3D" alt="bunlongheng.com"></a>
<a href="https://www.linkedin.com/in/bunlongheng/"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
<a href="https://www.instagram.com/ibunlong/"><img src="https://img.shields.io/badge/Instagram-C13584?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
<a href="mailto:bheng.code@gmail.com"><img src="https://img.shields.io/badge/Email-2E7D32?style=for-the-badge&logo=gmail&logoColor=white" alt="Email"></a>

<br>

Built by **[Bunlong](https://bunlongheng.com)** &nbsp;&middot;&nbsp; [more apps](https://bunlongheng.com/projects)

</div>
