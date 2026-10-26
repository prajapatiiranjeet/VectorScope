# VectorScope interface architecture

## Design intent

VectorScope is a data workspace, so the embedding plot owns the largest continuous surface. Navigation stays in a compact top rail. Filters and record details are contextual overlays that preserve the plot's width and orientation. Secondary surfaces use tonal separation and fine dividers instead of a grid of heavy cards. The current visual direction is an embedding atlas: warm mineral paper for the workbench, ink for hierarchy, deep botanical teal for active actions, and a small oxidized-copper signal for selected points. The plot remains the focal surface.

The spacing rhythm is based on 4 px increments: 4 px for icon/text pairing, 8 px for compact controls, 16 px for component groups, 24 px for section separation, and 32 px around major workspace regions. Body and metadata use a neutral sans-serif stack; weight and size distinguish page title, section title, body, and metadata. The warm paper/graphite surfaces carry structure. Deep botanical teal identifies active controls and matches; oxidized copper marks the selected record. Category hues are limited to three muted mineral variants. Typography pairs a Windows-native display face when available with Aptos/Segoe fallbacks, then uses tabular Cascadia/Consolas numerals for vector values and scores.

## Application shell and component map

```text
App
├── Header / dataset identity / import and export actions
├── PrimaryNav + role switcher (Analyst | Admin | Support)
├── Analyst workspace
│   ├── SearchDock (query vector, metric, top K, threshold)
│   ├── GraphViewport (PCA projection, hover tooltip, optional neighbor edges)
│   ├── ResultList (ranked matches and scores)
│   ├── FilterDrawer (metadata field and category)
│   └── RecordInspector (selected vector, metadata, nearest neighbors)
├── AdminDashboard (session dataset health, schema and import issues)
└── SupportDashboard (CSV validation queue; no fabricated live tickets)
```

### Component responsibilities

| Component | Responsibility | Interaction and state |
|---|---|---|
| `App` | Owns the session dataset, search, role and overlay state. | CSV load/export, role navigation, filters, selection. |
| Header and primary navigation | Make dataset identity and primary destinations scannable. | Analyst/Admin/Support switch; keyboard-visible focus. |
| `SearchDock` | Keep the critical query path close to the graph. | Metric, query vector, top K and score threshold. |
| `GraphViewport` | Give the 3D projection maximum room. Avoid permanent text labels. | Rotate/zoom; hover reveals a concise tooltip; click selects a record. |
| `FilterDrawer` | Keep metadata controls available without consuming permanent width. | Open from the toolbar; field and value filters. |
| `ResultList` | Show exact ranked results in a readable, sortable list. | Click a result to synchronize selection and inspector. |
| `RecordInspector` | Provide detail on demand without hiding the graph. | Selected record, vector values, metadata, nearest neighbors. |
| `AdminDashboard` | Summarize actual session data and schema. | Counts, dimensions, norms, import issues, recent query activity. |
| `SupportDashboard` | Surface actionable CSV parse/validation problems. | Fix source data or import valid rows; empty state states there is no live ticket connector. |

## Role layouts

### Analyst / Developer

The graph occupies the main content grid. Search controls and result ranking form the lower workbench; filters and the record inspector are drawers. Similarity search and relations reuse the same dataset and selection state. The user can inspect a point without losing the surrounding neighborhood.

### Admin / Management

The overview leads with records, vector dimensions, metadata field count and average vector norm. A compact schema summary, import validation count, and recent search activity follow. These figures are computed from the current browser session; there is no implied backend or organization-wide health feed.

### Support

The primary queue is the current import validation issue list. Each issue links back to the CSV source row when available; the dashboard supports importing valid rows while retaining the invalid-row report. If there are no issues, a truthful empty state explains that no external ticket stream is connected.

## Plot density and performance

The current implementation projects records to three PCA coordinates and plots up to 900 evenly sampled points with Plotly's WebGL `scatter3d` renderer. It suppresses per-point text labels, uses subtle grid lines, and shows IDs, a short text excerpt, group and norm in a hover tooltip. Selection and similarity results use size and outline in addition to restrained color, so meaning is not encoded by hue alone. Exact similarity search still uses all filtered records, even when the visualization is sampled.

For datasets under roughly 500 points, crisp SVG is a good accessible option. From hundreds to several thousand points, Canvas/WebGL avoids DOM/SVG node overhead; for substantially larger collections, add viewport-aware sampling or density aggregation and keep exact retrieval separate from the preview. Provide an accessible ranked result list and keyboard selection as the non-graph path to each record. Tooltips should be anchored away from occupied points where possible and remain concise; the ranked list and inspector are the stable detail surfaces.

## Tailwind and React implementation pattern

Tailwind v4 is enabled through `@tailwindcss/vite` and imported in `src/style.css`. Reusable spacing uses the 4/8 px rhythm. The interface defaults to the new paper theme and keeps a coordinated dark variant. Components use semantic headings and buttons, focus rings, hover/active states, tabular numbers, and responsive breakpoints. Example of the shell pattern:

```tsx
<main className="min-h-screen bg-slate-950 text-slate-100">
  <header className="flex min-h-14 items-center justify-between border-b border-slate-800 px-4 lg:px-6">
    <DatasetIdentity />
    <PrimaryActions />
  </header>
  <PrimaryNav />
  <section className="grid min-h-[calc(100vh-7rem)] grid-cols-1 gap-4 p-4 lg:p-6">
    <GraphViewport className="min-h-[28rem] rounded-xl bg-slate-900/70" />
    <SearchWorkbench className="grid gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]" />
  </section>
  <FilterDrawer />
  <RecordInspector />
</main>
```

In this implementation, `App.tsx` composes the analyst shell and interactive graph/search flows, while `RoleDashboards.tsx` contains admin and support views. `core.ts` owns parsing, vector metrics, ranking and projection logic. `style.css` supplies the visual tokens, Plotly integration, responsive drawer behavior, and reduced-motion handling. This keeps calculation logic independent from presentation and makes it possible to replace the graph renderer without rewriting search.

## Visual and interaction checks

- Maintain visible keyboard focus and sufficient contrast for body, metadata, controls and plot selection.
- Preserve a minimum 44 px touch target for primary controls where practical.
- Keep horizontal overflow out of the page at phone widths; drawers use the full available width.
- Honor reduced-motion preferences and avoid using animation to signal data meaning.
- Validate with actual imported data. Empty/loading/error states must not imply that a dataset, ticket feed or system-health service exists.

