// Agent tools. One defineAction() = a UI/server action AND an MCP tool at /mcp,
// behind a single auth gate. search_docs shares the same KB + embedder as the
// human-facing search route — one source, zero drift.
import { defineAction } from "@kurajs/docs/actions";
import { getKb } from "./kb";

export const search_docs = defineAction({
  id: "search_docs",
  description:
    "在台灣維基百科知識庫做語意檢索,回傳最相關的段落(標題、內文、相似度)。" +
    "Semantic search over the Taiwan-Wikipedia knowledgebase; returns the most relevant paragraphs.",
  input: {
    type: "object",
    properties: {
      query: { type: "string", description: "自然語言問題或關鍵字 / a natural-language question or keywords" },
      topK: { type: "integer", description: "回傳幾筆,預設 5 / number of results, default 5" },
    },
    required: ["query"],
  },
  async run(input: { query: string; topK?: number }) {
    const kb = await getKb();
    const hits = await kb.searchText(input.query, { topK: input.topK ?? 5 });
    return hits.map((h) => ({ title: h.data.title, score: Number(h.score.toFixed(4)), text: h.data.text }));
  },
});
