import type { Loaded } from "@kurajs/docs";
import { getKb, docCount } from "./kb";
import "./actions"; // register defineAction()s (search_docs) into the agent/MCP registry

type Hit = { score: number; title: string; text: string };

export const loader = async (ctx: { url: URL }) => {
  const q = (ctx.url.searchParams.get("q") ?? "").trim();
  const count = await docCount();
  if (!q) return { q, count, hits: [] as Hit[], error: null as string | null };
  try {
    const kb = await getKb();
    const hits = await kb.searchText(q, { topK: 5 });
    return { q, count, hits: hits.map((h) => ({ score: h.score, title: h.data.title, text: h.data.text })), error: null };
  } catch (e) {
    return { q, count, hits: [] as Hit[], error: String((e as Error)?.message ?? e) };
  }
};

const card: React.CSSProperties = { border: "1px solid #eee", borderRadius: 10, padding: "1rem", background: "#fff" };

export default function Search({ q, count, hits, error }: Loaded<typeof loader>) {
  return (
    <main style={{ maxWidth: 720, margin: "3rem auto", padding: "0 1rem", fontFamily: "system-ui, -apple-system, 'Noto Sans TC', sans-serif" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: ".25rem" }}>蔵 Kura 搜尋</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        在 {count.toLocaleString()} 段台灣維基百科(DRCD)上做繁中語意檢索 — 資料存在 SQLite,跑在 June 上。
      </p>

      <form method="get" style={{ display: "flex", gap: ".5rem", margin: "1.5rem 0" }}>
        <input name="q" defaultValue={q} placeholder="輸入問題,例如:怎麼部署到 Cloudflare?" autoFocus
          style={{ flex: 1, padding: ".6rem .8rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8 }} />
        <button type="submit" style={{ padding: ".6rem 1.2rem", fontSize: "1rem", borderRadius: 8, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}>搜尋</button>
      </form>

      {error && <p style={{ color: "crimson" }}>錯誤:{error}</p>}
      {q && !error && hits.length === 0 && <p style={{ color: "#666" }}>沒有結果。</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
        {hits.map((h, i) => (
          <li key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#999", fontSize: ".85rem" }}>
              <span>📄 {h.title}</span>
              <span>cos {h.score.toFixed(3)}</span>
            </div>
            <p style={{ margin: ".4rem 0 0", lineHeight: 1.6 }}>{h.text.replace(/\s+/g, " ").slice(0, 200)}…</p>
          </li>
        ))}
      </ul>

      <p style={{ marginTop: "2.5rem", color: "#aaa", fontSize: ".8rem" }}>
        同一個查詢,agent 也讀得到:<a href={`/.json?q=${encodeURIComponent(q)}`}>/.json</a> · <code>/mcp</code>
      </p>
    </main>
  );
}

export const json = ({ q, hits }: Loaded<typeof loader>) => ({ query: q, hits });

export const metadata = { title: "搜尋" };
