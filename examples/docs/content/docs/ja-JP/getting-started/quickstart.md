---
title: クイックスタート
description: 3 ステップで最初の Kura ナレッジベースを作成し、起動します。
---

# クイックスタート

## 1. 雛形を作る

```bash
npm create kura@latest my-docs
cd my-docs && npm install
```

## 2. ページを書く

`content/docs/` に Markdown ファイルを置きます。フロントマターがタイトルを決め、
フォルダ構造がサイドバーになります。

## 3. 起動する

```bash
npm run dev
```

`http://localhost:3000` を開きます。ページは `/docs/hello` で公開され、エージェント
向けに `/docs/hello.md`・`/docs/hello.json`・`/mcp` でも提供されます。
