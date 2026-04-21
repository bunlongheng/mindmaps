# Mindmaps - Visual Mind Mapping Tool

Interactive mind mapping application with drag-and-drop nodes, multiple layout engines, PDF/image export, and offline PWA support.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19.2 + TypeScript 5.9 |
| Build | Vite 7.3 |
| State | Zustand 5.0 |
| Styling | Tailwind CSS 4.2 |
| Database | Supabase (PostgreSQL) |
| Export | html2canvas + jsPDF |
| Icons | Lucide React + Heroicons |
| QR | qrcode.react |
| PWA | vite-plugin-pwa (service worker, offline, auto-update) |
| Unit Tests | Vitest 4.1 + jsdom |
| E2E Tests | Playwright 1.58 |

## Architecture

```
Browser (PWA)
    |
    +-- React 19 SPA (Vite dev server :5173)
    |       |
    |       +-- Zustand store (mindmapStore.ts)
    |       |       - nodes, edges, layout state
    |       |       - undo/redo history
    |       |
    |       +-- Canvas renderer (DiagramCanvas)
    |       |       - SVG edge layer
    |       |       - Draggable node components
    |       |
    |       +-- Layout engines
    |       |       - mindmap, fishbone, timeline, brace
    |       |
    |       +-- Export pipeline
    |               - PDF (jsPDF + html2canvas)
    |               - JSON import/export
    |               - QR code sharing
    |
    +-- Supabase
            - Map persistence (save/load)
            - Auth
```

## Features

- Interactive canvas with drag-and-drop node creation and repositioning
- Multiple layout algorithms: mindmap, fishbone, timeline, brace
- Zustand-powered state management with real-time reactive updates
- Export to PDF and image via html2canvas + jsPDF
- JSON import/export for backup and sharing
- QR code generation for quick map sharing
- Supabase persistence for saving and loading maps
- PWA - installable, works offline with service worker caching
- Keyboard shortcuts for power users
- Auto-icon assignment based on node content
- Theming and color customization
- Side panel for node formatting
- Responsive design

## Project Structure

```
mindmaps/
  api/                      # Serverless API routes
    ai/                     # AI-powered features
    notify.ts               # Notification endpoint
  e2e/                      # Playwright E2E tests
    canvas-interactions.spec.ts
    import-export.spec.ts
    mindmap.spec.ts
    save-persist.spec.ts
  public/                   # Static assets
  scripts/                  # Build scripts
    generate-icons.mjs      # PWA icon generator
  src/
    components/
      canvas/               # Canvas rendering
        DiagramCanvas.tsx    # Main canvas surface
        Edge.tsx             # Edge connector
        EdgeLayer.tsx        # SVG edge overlay
        Node.tsx             # Draggable node
        NodeIcon.tsx         # Auto-assigned icons
      home/
        HomePage.tsx         # Landing / map list
      modals/
        ImportModal.tsx      # JSON import dialog
      panels/
        SidePanel.tsx        # Node formatting panel
      AIThinkingOverlay.tsx
      Confetti.tsx
      CuteToast.tsx
      MindmapsLogo.tsx
    hooks/
      useDiagram.ts         # Diagram lifecycle hook
      useKeyboard.ts        # Keyboard shortcut bindings
    lib/
      export/               # Export utilities
        exportPdf.ts        # PDF generation
        json.ts             # JSON import/export
        share.ts            # QR code sharing
      layout/               # Layout algorithms
        brace.ts
        fishbone.ts
        mindmap.ts
        timeline.ts
        mindmaps-layout.ts  # Layout orchestrator
      autoIcon.ts           # Content-based icon picker
      color.ts              # Color utilities
      geometry.ts           # Node positioning math
      icons.ts              # Icon registry
      is-local.ts           # Local dev detection
      sounds.ts             # UI sound effects
      supabase.ts           # Supabase client
      themes.ts             # Theme definitions
    store/
      mindmapStore.ts       # Zustand global store
    types/
      index.ts              # TypeScript type definitions
    test/                   # Unit test files
  supabase/
    migrations/             # Database schema migrations
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 5173 |
| `npm run build` | TypeScript check + Vite production build |
| `npm run prod` | Build + preview production bundle |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest unit tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:all` | Run unit + E2E tests |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

---

Built by [Bunlong Heng](https://www.bunlongheng.com) | [GitHub](https://github.com/bunlongheng/mindmaps)
