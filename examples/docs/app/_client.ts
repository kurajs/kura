// The client entry (app/_client.* convention). startJuneClient hydrates islands and — when
// clientRouter is on — wires the morph router + dev live-reload. It MUST be called, or the
// client router never starts (links hard-navigate). initSearch then lights up the ⌘K palette.
import { startJuneClient } from "@junejs/core/islands-client";
import { initSearch } from "@kurajs/docs/client";

import { ISLAND_LOADERS } from "./_islands.gen";

startJuneClient({ loaders: ISLAND_LOADERS });
initSearch();
