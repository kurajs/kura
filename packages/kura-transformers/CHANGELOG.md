# @kurajs/transformers

## 0.0.2

### Patch Changes

- [#16](https://github.com/kurajs/kura/pull/16) [`024deee`](https://github.com/kurajs/kura/commit/024deee60be49f39708dbd5acc5caf99dde5c250) Thanks [@linyiru](https://github.com/linyiru)! - Self-heal a corrupt/incomplete embedder model download

  Transformers.js caches a partial model download as if it were complete, so a truncated `bge-m3`
  download (e.g. an interrupted first fetch) made every subsequent `kura index` fail forever with a
  cryptic `Protobuf parsing failed` / `Deserialize tensor … out of bounds`. The embedder now detects
  that ONNX load-error shape, wipes the model's cache once, and re-downloads — and if it still fails,
  throws a clear, actionable message (model download incomplete; bge-m3 q8 is ~543MB; check network/disk)
  instead of the cryptic error.
