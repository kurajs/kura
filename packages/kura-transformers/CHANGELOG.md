# @kurajs/transformers

## 0.1.0

### Minor Changes

- [`4c25d3c`](https://github.com/kurajs/kura/commit/4c25d3c9beb26df25d7849fe7326d629d453d9e3) Thanks [@linyiru](https://github.com/linyiru)! - Kura 0.1.0 — adopt the June 0.1.0 line

  June released `@junejs/core` and `@junejs/server` 0.1.0 (the `@junejs/cli` orchestrator stays 0.0.51 but now depends on `>=0.1.0`, so the whole runtime resolves to the 0.1.0 line). `@kurajs/docs` now peers `@junejs/core` at `>=0.1.0 <0.2.0` (was `<0.1.0`) — a required, consumer-visible move, since a project on June 0.0.x must upgrade. June 0.1.0 is additive at Kura's import surface (every subpath Kura uses — `route`, `config`, `agent`, `i18n`, `outlet`, `islands-client` — still exists), and the full suite is green on it: all package builds, 302 tests, `examples/docs` build, and a running dev server serving HTML / `.md` / i18n / `/search` / `/mcp`. The whole `@kurajs/*` set moves to 0.1.0 together so the Kura version line tracks June's.

## 0.0.2

### Patch Changes

- [#16](https://github.com/kurajs/kura/pull/16) [`024deee`](https://github.com/kurajs/kura/commit/024deee60be49f39708dbd5acc5caf99dde5c250) Thanks [@linyiru](https://github.com/linyiru)! - Self-heal a corrupt/incomplete embedder model download

  Transformers.js caches a partial model download as if it were complete, so a truncated `bge-m3`
  download (e.g. an interrupted first fetch) made every subsequent `kura index` fail forever with a
  cryptic `Protobuf parsing failed` / `Deserialize tensor … out of bounds`. The embedder now detects
  that ONNX load-error shape, wipes the model's cache once, and re-downloads — and if it still fails,
  throws a clear, actionable message (model download incomplete; bge-m3 q8 is ~543MB; check network/disk)
  instead of the cryptic error.
