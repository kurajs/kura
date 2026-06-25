---
"create-kura": patch
---

Ignore the generated `app/_dates.ts` in scaffolded apps

`kura index` always writes `app/_dates.ts` (the last-updated map, empty when the feature is off), but the
scaffold's `.gitignore` didn't list it, so it showed up as an untracked file after every build. Added it
alongside the other generated `app/_*` artifacts.
