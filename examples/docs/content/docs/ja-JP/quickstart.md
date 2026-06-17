---
title: クイックスタート
description: 3 ステップで最初の Kura ナレッジベースを作成し、起動します。
section: Get started
order: 2
---

# クイックスタート

## インストール

スキャフォルダーで新しいプロジェクトを作成します:

```bash
npm create kura my-docs
cd my-docs
npm install
```

## コンテンツを追加

`content/docs/` に Markdown ファイルを置き、フロントマターで各ページを記述します:

```md
---
title: 最初のページ
section: Get started
order: 1
---

# 最初のページ

ここに内容を書きます。
```

## 起動

```bash
npm run dev
```

`http://localhost:3000` を開けば、サイドバー・目次・検索、そして各ページの `.md` と `/mcp` が
すべて揃っています。
