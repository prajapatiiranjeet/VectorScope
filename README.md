# VectorScope

**Created by Ranjeet Prajapati**

VectorScope is a local-first workspace for exploring embedding datasets. Import a CSV, inspect a 3D PCA map, and compare query vectors against the original embeddings. Parsing, projection, filtering, and ranking run in the browser; records are not uploaded or persisted after the tab session ends.

## Develop locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Create and inspect a production build with:

```sh
npm run build
npm run preview
```

Run the unit suite with `npm test`.

## Import a dataset

Choose **Import CSV**, select a UTF-8 CSV up to 50 MB and 100,000 rows, then map its record ID, optional text, and vector fields. VectorScope detects common `embedding_0` / `embedding_1` columns and a single `embedding` or `vector` column. You can review or adjust the mapping before importing.

```csv
id,text,category,embedding_0,embedding_1,embedding_2
record-001,Machine learning basics,AI,0.12,0.45,0.89
record-002,Database indexing,DB,0.22,0.17,0.63
```

A vector can also be stored in one column:

```csv
id,text,embedding
record-001,Machine learning basics,"[0.12, 0.45, 0.89]"
record-002,Database indexing,"0.22, 0.17, 0.63"
```

Malformed rows, duplicate IDs, missing values, inconsistent dimensions, and non-finite numbers are reported with CSV row numbers. If some rows are usable, VectorScope asks before importing only those rows. You can download an issue report from the import dialog.

## Explore and search

- The 3D map shows a centered PCA projection of the original vectors. Its numbered X, Y, and Z guides and coordinate grid adapt to the visible scale.
- Drag the map or use the Y rotation slider to rotate points, axes, grid, and neighbor links together around a fixed vertical Y axis. X and Z swing around the view while Y stays upright.
- Scroll or pinch to zoom toward the pointer or pinch center. Use **Reset view** to restore the starting zoom and orientation; use the full-screen control for detailed inspection.
- Click a point to inspect its Record ID, text, metadata, original vector dimensions, norm, and PCA coordinates.
- Paste a numeric query vector to run cosine similarity, Euclidean distance, or dot-product search. Scores use original vectors. Matching Record IDs are highlighted and isolated automatically; choose **Show all** to restore the other points.
- Toggle **Relations** to show undirected k-nearest-neighbor links. Links use gentle deterministic curves to reduce overlap and are drawn beneath the nodes. The relationship overlay uses the visible point set.
- For datasets above 900 records, the map uses a deterministic subset for rendering and adds search matches to that subset. Similarity search still checks every record in the active category filter.
- The synthetic sample is labeled and stays separate from imported datasets.

## Project structure

- `src/App.tsx` — application state, CSV workflow, graph controls, search, and dashboard composition.
- `src/core.ts` — CSV parsing, vector metrics, exact search, PCA projection, and nearest-neighbor selection.
- `src/graphAxes.ts` — theme-aware coordinate grid, axis ticks, and labels.
- `src/graphRelations.ts` — stable curved neighbor-link routing.
- `src/Plot3d.tsx` — lazy-loaded Plotly renderer.

## Current scope

VectorScope has no backend. It does not send imported data anywhere and does not persist datasets between reloads. Text search needs a compatible embedding provider; the app does not fabricate query vectors. No API key is used in the browser.

The current projection method is PCA. UMAP and t-SNE, clustering algorithms, metadata-file joins, IndexedDB persistence, background projection, and an embedding-provider backend are not implemented yet. The interactive map uses Plotly and WebGL.