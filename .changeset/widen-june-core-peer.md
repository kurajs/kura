---
"@kurajs/docs": patch
---

Widen the `@junejs/core` peer range to `>=0.1.0 <0.3.0 || >=0.2.0-0 <0.3.0` so June's `0.2.0-dev.*` prereleases (the `dev` dist-tag, where June ships fixes today — e.g. the client-router fragment-navigation fix in `0.2.0-dev.39`) satisfy the peer. Under strict semver a prerelease only matches a range that carries a prerelease comparator on the same `major.minor.patch`, so the old `>=0.1.0 <0.2.0` — and a naive `<0.3.0` — never matched a `0.2.0-dev.N` core at all; the second alternative is what admits them. Stable `0.1.x` and `0.2.x` remain accepted.
