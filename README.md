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

Choose **Import CSV**, select a UTF-8 CSV up to 50 MB and 100,000 rows, then map its record ID, optional text, and vector fields. **Every imported embedding must contain exactly 384 finite numeric values.** Shorter and longer vectors are rejected with a row-specific issue; they are never padded or truncated. This matches the 384-dimensional embedding file used with VectorScope.

Accepted formats:

- One `embedding` or `vector` column containing a JSON array or comma-separated values with exactly 384 entries.
- Exactly 384 numeric dimension columns, such as `embedding_0` through `embedding_383`.

VectorScope detects common embedding columns and a single vector column. Review or adjust the mapping before importing. Malformed rows, duplicate IDs, missing values, wrong vector lengths, and non-finite numbers are reported with CSV row numbers. If some rows are usable, VectorScope asks before importing only those rows. You can download an issue report from the import dialog.
## Explore and search

- The 3D map shows a centered PCA projection of the original vectors. Its numbered X, Y, and Z guides and coordinate grid adapt to the visible scale.
- Drag the map or use the Y rotation slider to rotate points, axes, grid, and neighbor links together around a fixed vertical Y axis. X and Z swing around the view while Y stays upright.
- Scroll or pinch to zoom toward the pointer or pinch center. Use **Reset view** to restore the starting zoom and orientation; use the full-screen control for detailed inspection.
- Click a point to inspect its Record ID, text, metadata, original vector dimensions, norm, and PCA coordinates.
- Paste a numeric query vector to run cosine similarity, Euclidean distance, or dot-product search, or enter a text query to create a 384-dimensional MiniLM embedding in the browser. Scores use original vectors. Matching Record IDs are highlighted and isolated automatically; choose **Show all** to restore the other points.
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

VectorScope has no backend. Imported records and text queries stay in the browser and are not sent to a server. Text query search uses the 384-dimensional all-MiniLM-L6-v2 model through Transformers.js in a web worker. On first use, the browser downloads a quantized model file (about 23 MB) from Hugging Face; the browser cache speeds up later use. This runs on static hosting such as Render Static Sites and needs no Ollama process, API key, or paid inference server. Search compares the generated query embedding against original 384-dimensional dataset vectors. Use vectors generated with the same all-MiniLM-L6-v2 model; matching dimensions alone do not guarantee compatible embeddings. The synthetic sample is not model-embedded, so text search is unavailable for that sample. The quantized ONNX model uses the same all-MiniLM-L6-v2 model family as Ollama’s `all-minilm` package, but it is downloaded separately and runs in the browser.

The current projection method is PCA. UMAP and t-SNE, clustering algorithms, metadata-file joins, IndexedDB persistence, background projection, and an embedding-provider backend are not implemented yet. The interactive map uses Plotly and WebGL.