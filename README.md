# VectorScope

VectorScope is a local-first workspace for inspecting existing embedding CSVs. CSV parsing, projection, filtering, and exact vector comparisons run in the browser; records are not uploaded or persisted after the tab session ends.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production bundle:

```sh
npm run build
npm run preview
```

## Import a CSV

Choose **Import CSV**, select a UTF-8 CSV up to 50 MB and 100,000 rows, then map its ID, optional text, and vector fields. VectorScope detects common `embedding_0`/`embedding_1` columns and a single `embedding` or `vector` column. You can change the mapping before importing.

Supported examples:

```csv
id,text,category,embedding_0,embedding_1,embedding_2
doc-001,Machine learning basics,AI,0.12,0.45,0.89
doc-002,Database indexing,DB,0.22,0.17,0.63
```

```csv
id,text,embedding
doc-001,Machine learning basics,"[0.12, 0.45, 0.89]"
doc-002,Database indexing,"0.22, 0.17, 0.63"
```

Malformed rows, repeated IDs, missing values, inconsistent dimensions, and non-finite numbers are reported with CSV row numbers. If some rows are valid and others are not, VectorScope asks before importing the valid rows. An issue report can be downloaded from the import dialog.

## Explore and search

- The 3D map uses a centered PCA projection of the original vectors. Click points to inspect their source text, metadata, original dimensions, vector norm, and vector preview.
- Use a pasted numeric query vector to run exact cosine similarity, Euclidean distance, or dot-product search. Results are calculated from the original vectors, and the matching points are highlighted in the map.
- Toggle the relation overlay to draw undirected k-nearest-neighbor links. These links are computed from original vectors; projected distances are not search scores.
- For views above 900 points, the map uses a deterministic subset for rendering. Search still checks every record in the active dataset.
- The synthetic sample is labeled and stays separate from imported datasets.

## Tests

```sh
npm test
```

The unit suite covers safe vector parsing, CSV validation, exact ranking and metric edge cases, and deterministic 3D projection.

## Current scope and limitations

This first version has no backend. It does not send imported data anywhere and does not persist datasets between reloads. Text search is disabled because text must first be embedded by a compatible provider; VectorScope never fabricates that query vector. No API key is used in the browser.

The current projection method is PCA. UMAP and t-SNE, clustering algorithms, metadata-file joins, IndexedDB persistence, cancellation/background projection, and an embedding-provider backend are not implemented yet. Relation overlays are bounded by the rendered sample for responsiveness. The UI is an interactive 3D Plotly/WebGL scatter plot.

