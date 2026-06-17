// The one vendor-specific seam in docs-sync. Steps 1 (sources→candidates) and 3 (open PR)
// are backend-neutral; only this runs "an agent". Any coding agent that can edit files in a
// working dir given a prompt fits — Claude Agent SDK, a CLI agent (Copilot/Codex/Gemini), etc.
//
// @typedef {Object} AgentTask
// @property {string}   cwd         Working dir (the checked-out repo) the agent edits in place.
// @property {string}   prompt      What to do.
// @property {string[]} allowEdits  Globs the agent may edit (e.g. ["docs/**"]). The backend
//                                   SHOULD confine edits to these; the orchestrator also verifies.
//
// @typedef {Object} AgentResult
// @property {string} summary       Short human-readable summary of what the agent did.
//
// @typedef {Object} AgentBackend
// @property {string} name
// @property {(task: AgentTask) => Promise<AgentResult>} run
export {};
