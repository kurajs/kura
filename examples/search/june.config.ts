import { defineJune } from "@junejs/core/config";
import { sqlite } from "@junejs/server";

export default defineJune({
  site: {
    name: "Kura Search",
    description: "The knowledgebase for humans and agents — semantic search on June.",
  },
  agent: { enabled: true }, // /mcp, /llms.txt, .md/.json projections
  resources: {
    db: sqlite({ path: "kura.db" }), // real SQLite: DRCD Taiwan-Wikipedia + embeddings
  },
});
