// June bundles app/_client.* to /_june/client.js and injects it as a module <script>.
// One line lights up the ⌘K command palette over /search.json — progressive enhancement on
// top of the server-rendered search form (works with JS off, upgrades when it loads).
import { initSearch } from "@kurajs/docs/client";

initSearch();
