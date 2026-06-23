---
title: 介紹
description: Kura 是為人類與 AI agent 同時打造的知識庫。
---

# 介紹

Kura 把同一份 Markdown 同時投影成「給人看的網站」與「給 agent 呼叫的 MCP 伺服器」,
單一來源、零分歧。本範例特別示範中日文(CJK)的關鍵字搜尋。

中文與日文之間沒有空格,無法用空白斷詞。Kura 依語系挑選分詞器:繁體中文與日文
使用瀏覽器原生的 `Intl.Segmenter` 做詞級切分,其他語言則用拉丁分詞器。
