#!/usr/bin/env bash
# Package-correctness guardrails. Run after `bun install` + building the published packages.
#
#   1. Exactly ONE physical @junejs/core. A duplicate forks @junejs/core's AsyncLocalStorage
#      request scope, so currentLocale() set in one copy is invisible to the other — the i18n
#      nav-prefix bug we chased. Version skew (a narrow range pulling an older core) is the cause;
#      this catches it from the resolved tree, not from a symptom.
#   2. publint (package.json / exports / files correctness) on EVERY published package, including
#      the bins (@kurajs/cli, create-kura).
#   3. attw (type resolution across module systems) on the TYPED libraries only — the bins export
#      no types, which attw would correctly report as "no types", but that's by design here. The
#      libraries are ESM-only (node-free June runtime), so the expected CJS-resolves-to-ESM and
#      node10 no-resolution problems are ignored; attw still catches real failures (broken subpath
#      types, internal resolution errors, missing types on a library entry).
set -euo pipefail

# Published to npm (release.yml publishes every non-private packages/*). publint runs on all of them.
PUBLISHED=(kura search tokenizers ctrlk kura-transformers docs cli create-kura)
# The subset that ships type declarations — attw only makes sense for these.
TYPED=(kura search tokenizers ctrlk kura-transformers docs)

echo "→ exactly one physical @junejs/core"
# Search EVERY workspace node_modules (root + per-package dirs the isolated linker creates), then
# dedup by real path so symlinks into the .bun store collapse onto the physical copies they target.
cores=$(find . -path '*/node_modules/@junejs/core/package.json' 2>/dev/null \
          | while read -r f; do (cd "$(dirname "$f")" && pwd -P); done | sort -u)
n=$(printf '%s\n' "$cores" | grep -c . || true)
if [ "$n" != "1" ]; then
  echo "✘ expected exactly 1 @junejs/core, found $n (version skew → forked module singletons):"
  printf '%s\n' "$cores" | sed 's/^/    /'
  exit 1
fi
echo "  ✓ single @junejs/core"

# Invoke the root-pinned tools from the repo root (passing the package path) so bunx resolves the
# lockfile-pinned versions rather than downloading a per-package copy — reproducibility matters more
# under the isolated linker, where a package dir may not see the root devDependency.
echo "→ publint (all published packages)"
for p in "${PUBLISHED[@]}"; do
  name=$(bun -p "require('./packages/$p/package.json').name")
  echo "  → $name"
  bunx publint "packages/$p"
done

echo "→ attw (typed libraries)"
for p in "${TYPED[@]}"; do
  name=$(bun -p "require('./packages/$p/package.json').name")
  echo "  → $name"
  bunx @arethetypeswrong/cli --pack "packages/$p" --ignore-rules cjs-resolves-to-esm no-resolution
done

echo "✓ all package checks passed"
