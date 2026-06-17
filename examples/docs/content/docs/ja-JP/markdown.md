---
title: Markdown と投影
description: 一つのソースから 4 つの投影 —— HTML、Markdown、JSON、MCP。
section: Concepts
order: 2
---

# Markdown と投影

Kura のすべてのページは、一つの Markdown ソースから、読み手ごとに複数の「投影」を生み出します。

## 一つのソース、4 つの投影

| 投影 | 対象 | 取得方法 |
| --- | --- | --- |
| HTML | 人間 | このページをそのまま閲覧 |
| Markdown | 人間 / エージェント | URL に `.md` を付加 |
| JSON | プログラム | URL に `.json` を付加 |
| MCP ツール | AI エージェント | `POST /mcp` |

## Markdown をコピー

各ページの右上にある「Markdown をコピー」ボタンで、そのページの生の Markdown をクリップボードに
コピーできます。ChatGPT・Claude・Cursor に貼り付けるのに最適な形式です。「Markdown として表示」も
できます。

> どの投影も同じソースから生成されるため、人間が見るものとエージェントが受け取るものは常に一致し、
> ずれることはありません。
