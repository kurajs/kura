# 部署

要把你的網站發佈到 Cloudflare Workers,執行 `june deploy` 指令即可。建置會產生一個可攜的
Worker bundle,直接跑在邊緣節點上。

同一份程式碼也能部署到 Vercel 或 Deno Deploy,不需要修改任何程式。資料庫方面,本地用 SQLite、
雲端對映到 Cloudflare D1,SQL 完全一致。
