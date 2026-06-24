#!/usr/bin/env bash
# Package-correctness guardrails. Run after `bun install` + building the published packages.
#
#   1. Exactly ONE physical @junejs/core. A duplicate forks @junejs/core's AsyncLocalStorage
#      request scope, so currentLocale() set in one copy is invisible to the other — the i18n
#      nav-prefix bug we chased. Version skew (a narrow range pulling an older core) is the cause;
#      this catches it from the resolved tree, not from a symptom.
#   2. Every published package lints clean (publint) and resolves types correctly across module
#      systems (attw). The packages are ESM-only by design (node-free June runtime), so the
#      CJS-resolves-to-ESM and node10 no-resolution problems are expected and ignored — attw still
#      catches the real failures (broken subpath types, internal resolution errors, missing types).
set -euo pipefail

PUBLISHED=(kura search tokenizers ctrlk kura-transformers docs cli)

echo "→ exactly one physical @junejs/core"
cores=$(find node_modules -path '*@junejs/core/package.json' 2>/dev/null \
          | while read -r f; do (cd "$(dirname "$f")" && pwd -P); done | sort -u)
n=$(printf '%s\n' "$cores" | grep -c . || true)
if [ "$n" != "1" ]; then
  echo "✘ expected exactly 1 @junejs/core, found $n (version skew → forked module singletons):"
  printf '    %s\n' $cores
  exit 1
fi
echo "  ✓ single @junejs/core"

echo "→ publint + attw per published package"
for p in "${PUBLISHED[@]}"; do
  name=$(node -p "require('./packages/$p/package.json').name")
  echo "  → $name"
  ( cd "packages/$p" && bunx publint )
  ( cd "packages/$p" && bunx @arethetypeswrong/cli --pack . --ignore-rules cjs-resolves-to-esm no-resolution )
done

echo "✓ all package checks passed"
