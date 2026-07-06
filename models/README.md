# Models

Trained model artifacts (ONNX). Empty in the current release — the app runs
its classical CV pipeline client-side with no weights.

Expected contents once training (see `../training/README.md`) produces
exportable checkpoints:

```
models/
  grade-head-v1.onnx        # overall + subgrade regression
  defect-head-v1.onnx       # defect segmentation
  quality-head-v1.onnx      # photo quality gate
  card-id-v1.onnx           # recognition embedding
  card-index-v1.bin         # ANN index of card embeddings
  MANIFEST.json             # versions, input shapes, calibration temps
```

Loading order in `app/api/analyze/route.ts`: read `MANIFEST.json`, lazy-load
sessions with `onnxruntime-node`, fall back to the classical pipeline when a
model is missing.
