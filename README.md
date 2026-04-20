# Tairos Sentinel

> Multi-domain command console for tactical planning, persistent situational monitoring, and coordinated defensive + offensive operations over Türkiye.

Tairos Sentinel is a web-based command surface that collapses four operating modes — **tactical planning**, **situational monitoring**, **defense**, and **offensive coordination** — onto a single geographic canvas. Operators plan UAV coverage and strategic placement, fuse multi-source intel (conflicts / global sites / force deployments / weather / live infra), and turn the same map into a defensive posture view or an offensive coordination surface as the situation demands.

---

## Highlights

### Coverage & product layers
- **Per-product coverage polygons** (Nova, Iris, Radar) merged from user-selected source sites (nodes and/or facility categories) and clipped to the Turkish land border.
- **Adjustable ranges** per product (10–1000 km) with quick presets.
- **Radar sweep visualisation** — rotating, station-individual scopes at every radar source site.
- **Per-facility product deployments** — the same product can be pinned to specific facilities/nodes with independent range, quantity, lifecycle status (planned / deployed / active / maintenance / retired), and operator notes.

### Strategic product placement
- Draw a polygon, pick which systems to co-locate at every chosen center, and the algorithm computes the **minimum number of centers** that fully cover the area using the longest-range product as the driver.
- Hex-packed candidate grid + greedy max-cover solver.
- Target coverage is tunable (70–100%); trade completeness for fewer sites.

### Area selection & groups
- **Right-drag anywhere on the map** to select a rectangular area (Windows-desktop style).
- Live panel shows: area (km²), dimensions, facility count per active category, node list, center coordinates.
- Save the selection as a named **group**; groups render as labelled dashed rectangles.
- Click a saved group (map or sidebar) to reopen, rename, recolor, update bounds, delete, or hand directly to the placement tool.
- **Bulk cleanup:** delete every custom node inside the selection in one click — critical once multiple placement runs leave the map crowded.

### Conflict Intel layer
- **Country bubbles** for active theatres — pulsing markers sized by severity, coloured by status (aktif / süregelen / dondurulmuş / gerilim).
- **Approximate frontlines** drawn as animated dashed polylines (e.g. Ukrainian front, Kashmir Line of Control, Yemen contact line).
- **Contested zones** rendered as translucent polygons (e.g. Russia-held Ukraine regions, Gaza Strip, RSF area in Sudan, Sahel tri-border).
- **Named hotspots** (Bakhmut, Avdiivka, Khartoum, Hudeyde, Goma, …) marked with small glyphs + labels.
- Clicking a bubble opens a **briefing panel** — parties, start year, severity, one-paragraph situational overview, and a dedicated "Tairos uygunluğu" block: priority products (Nova / Iris / Radar), operational headline, concrete use cases.
- Sidebar filter by status — show only active wars, only tension lines, etc.
- Ships with 12 seeded theatres (Ukraine, Gaza, Syria, Sudan, Yemen, Myanmar, DRC East, Libya, Sahel, Kashmir, Taiwan Strait, South Caucasus). Data is curated for platform-pitch relevance — not a live feed.

### Weather overlay (UAV-aware)
- **Cloud cover** (infrared satellite) with mix-blend-mode compositing so only real cloud mass lights up on the dark basemap.
- **Precipitation radar** with intensity palette, including nowcast (10 / 20 / 30-minute forecast).
- Scrubbable timeline, play/pause animation, shared opacity slider.
- Powered by [RainViewer](https://www.rainviewer.com/) (free, no API key).

### Base infrastructure layers
- Province borders, transportation, rail, place labels.
- Live Overpass queries for **cell towers**, **power grid**, **water infrastructure**, **internet/exchange infrastructure**, and **maritime features** (shipping lanes, ferries, lighthouses, harbours, marinas) that fetch dynamically as the map moves.
- Find-nearest-tower tool (right-click a point → 80 km Overpass search → distance and operator).

### Facilities
- Bundled facility dataset covering Turkish civil, military, and critical-infrastructure sites. Category filter with group accordion. Per-category counts. Same-location deduplication mode.

### Node management
- Preset + user-added nodes share one editable list. Add by clicking the map. Rename, remove, or reset to defaults. Persisted locally.

### UX polish
- **Tabbed sidebar** — Platform / Saha / İstihbarat. Every surface lives under one mental mode so no single scroll column carries everything.
- **Tactical UI sound design** — dry, metallic Web Audio synth preset library mapped to meaningful state transitions (node add, bulk delete, placement complete, weather toggle, conflict alert, tab switch). Mute toggle persists.
- Distance measure tool.
- URL state sync (center, zoom, active categories, active products, tile style) — share a view by URL.
- Streetview panel for ground-truth checks.
- Export-ready map canvas for screenshots/reports.

---

## Tech stack

| Layer             | Choice                                                |
|-------------------|-------------------------------------------------------|
| UI framework      | React 18 + Vite                                       |
| State             | Zustand (with `localStorage` persistence)             |
| Map engine        | Leaflet + react-leaflet                               |
| Geospatial ops    | Turf.js (polygon area, point-in-polygon, union, etc.) |
| Styling           | Tailwind CSS                                          |
| Weather tiles     | RainViewer public API                                 |
| External features | OpenStreetMap (Overpass API), Esri reference tiles    |
| Icons             | lucide-react                                          |

---

## Getting started

### Prerequisites
- **Node.js ≥ 18**
- **npm** (or pnpm / yarn — commands below are npm)

### Install & run
```bash
# 1. Clone
git clone <repo-url>
cd tairos

# 2. Install
npm install

# 3. Dev server (hot reload at http://localhost:5173)
npm run dev

# 4. Production build
npm run build

# 5. Preview production build
npm run preview
```

### Windows shortcut
`run-dev.bat` boots the dev server without typing commands.

---

## Project structure

```
src/
├── App.jsx                  # Top-level composition (state → views)
├── main.jsx                 # Entry point
├── index.css                # Global Tailwind + Leaflet overrides
│
├── components/              # All UI
│   ├── MapView.jsx          # Leaflet container + every map-side layer
│   ├── Sidebar.jsx          # Left control panel (sections, drones, etc.)
│   ├── TopBar.jsx           # Search, tile switcher, export
│   ├── StatCards.jsx        # Coverage / facility / node metrics
│   ├── DetailPanel.jsx      # Right-hand facility/node detail
│   ├── AreaInfoPanel.jsx    # Right-drag selection info + group edit
│   ├── PlacementPanel.jsx   # Strategic placement configurator
│   ├── WeatherLayer.jsx     # RainViewer cloud + rain tiles
│   ├── ConflictLayer.jsx    # Conflict bubbles, frontlines, zones
│   ├── ConflictDetailPanel.jsx # Per-conflict briefing + Tairos fit
│   ├── ConflictSection.jsx  # Sidebar intel tab content
│   ├── FacilityProducts.jsx # Per-site product deployments
│   └── overlays/            # Live Overpass overlay fetchers
│
├── store/useStore.js        # Zustand store (single source of truth)
│
├── config/
│   ├── categories.js        # Facility category taxonomy
│   └── drones.js            # Tairos product catalogue
│
├── utils/
│   ├── coverage.js          # Polygon merge / clip utilities
│   ├── placement.js         # Hex-packing + greedy min-cover solver
│   ├── weather.js           # RainViewer frame fetcher
│   ├── sounds.js            # Tactical Web Audio sound engine
│   ├── overpass.js          # OSM Overpass query helpers
│   ├── overlays.js          # Overlay definitions
│   ├── tiles.js             # Basemap tile providers
│   ├── towers.js            # Cell-tower Overpass query
│   ├── thinning.js          # Same-location dedup
│   └── facilityProducts.js  # Deployment model + status enum
│
├── hooks/
│   ├── useCoverage.js       # Memoised coverage polygon computation
│   └── useUrlState.js       # URL ⇄ store sync
│
└── data/
    ├── facilities.json      # Seed facility list
    ├── conflicts.json       # Seed conflict intel dataset
    └── tairos-nodes.json    # Seed Tairos node list
```

---

## Persistence model

Everything operator-editable is persisted to `localStorage` under namespaced keys so a browser refresh never loses work:

| Key                             | Contents                                    |
|---------------------------------|---------------------------------------------|
| `tairos-nodes-v2`               | Unified node list (presets + user-added)    |
| `tairos-facility-products-v1`   | Per-site product deployments                |
| `tairos-area-groups-v1`         | Named rectangular area groups               |

URL query string additionally carries transient view state (`lat`, `lng`, `z`, `c`, `d`, `tile`).

---

## Keyboard & mouse cheatsheet

| Gesture                                 | Action                                       |
|----------------------------------------|----------------------------------------------|
| Left-click empty map                   | Close detail panel / add node (edit mode)    |
| Left-click a marker                    | Open facility/node detail                    |
| Left-click a saved group               | Reopen group in info/edit panel              |
| **Right-click + drag**                 | **Rectangle area select** (open info panel)  |
| Right-click a marker (short)           | Context menu (streetview, place product, …)  |
| Right-click a drone card (sidebar)     | Range popover                                |
| `ESC`                                  | Close selection / placement / measure        |
| Double-click (placement drawing)       | Close polygon and advance to configuration   |

---

## Deployment

Any static host works — the build output is plain HTML/CSS/JS in `dist/`.

- **Netlify / Vercel / Cloudflare Pages** — point to the repo, build command `npm run build`, publish directory `dist`.
- **GitHub Pages** — `npm run build`, push `dist/` to `gh-pages` branch.
- **Self-hosted** — serve `dist/` behind nginx / Caddy / IIS.

> Heads up: third-party services used at runtime (RainViewer, Overpass, Esri reference tiles, OpenRailwayMap) have their own rate limits and attribution requirements. The production bundle ships the correct attribution in the Leaflet control strip.

---

## Roadmap candidates

- Mission templates (save a full scenario: active products, ranges, nodes, groups, weather opacity).
- Export report as PDF with map snapshot + metrics.
- Simulation: animate UAV sorties across a placement plan.
- Backend-shared workspaces (multi-operator).
- Additional environmental layers (wind, visibility, NOTAMs).

---

## License

Proprietary. See [LICENSE](./LICENSE). Contact the project maintainer for evaluation or licensing inquiries.
