// Kura config for the semantic search demo. This is a standalone June app (no docs routes),
// so defineKura() is used for site/agent config only; the data layer (SQLite) is wired
// via june.resources because it's a June-specific runtime primitive.
import { defineKura } from "@kurajs/docs";
import { sqlite } from "@junejs/server";

const kuraConfig = defineKura({
  site: {
    name: "Kura Search",
    description: "The knowledgebase for humans and agents — semantic search on June.",
  },
  june: {
    resources: {
      db: sqlite({ path: "kura.db" }), // real SQLite: DRCD Taiwan-Wikipedia + embeddings
    },
  },
});

export default kuraConfig;
