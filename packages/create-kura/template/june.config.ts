import { defineJune } from "@junejs/core/config";

export default defineJune({
  site: { name: "PROJECT_NAME", description: "The knowledgebase for humans and agents." },
  agent: { enabled: true }, // /mcp, /llms.txt, per-page .md/.json projections
});
