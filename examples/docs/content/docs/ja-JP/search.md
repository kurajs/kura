---
title: セマンティック検索
description: Kura のベクトル検索エンジンの仕組みと、なぜ高速かつ軽量なのか。
section: Concepts
order: 1
---

# セマンティック検索

Kura の検索エンジンは依存ゼロの純粋な JavaScript です。Node・Bun・Deno・Cloudflare Workers で同じ
コードが動きます。

## 仕組み

インデックス作成時に、ドキュメントは bge-m3 モデルで 1024 次元のベクトルに埋め込まれます。検索時には
質問も埋め込み、類似度で比較して、最も関連する箇所を返します。

```ts
import { Kb } from "@kurajs/core";
import { transformers } from "@kurajs/transformers";

const kb = new Kb({ embedder: transformers() });
await kb.addText([{ id: "intro", text: "..." }]);
const hits = await kb.searchText("どうやって始めるの?", { topK: 5 });
```

## 階層的な戦略

- **小規模コーパス（1 万件以下）**: 厳密な f32 総当たり、再現率 100%。
- **大規模コーパス**: バイナリの事前フィルタ + f32 再ランキング。メモリは 1/32、再現率はほぼ完璧。

## パフォーマンス

クエリのレイテンシは 1,000 ベクトルあたり約 0.1 ミリ秒。実際の 20 万件の埋め込みでも、バイナリ +
再ランキングで再現率 100% を維持します。
