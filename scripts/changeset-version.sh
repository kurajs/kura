#!/usr/bin/env bash
# Run `changeset version` with retries to ride out transient GitHub GraphQL failures
# (`Failed to parse data from GitHub: ... Premature close`, timeouts) in @changesets/changelog-github,
# which fetches PR/author info per changeset and has NO built-in retry. On such a failure changesets
# escapes cleanly — "no files should have been affected" — so re-running is safe and idempotent.
# Keeps the auto-linked CHANGELOG (we do NOT swap the changelog generator); this just makes the
# version PR job self-heal instead of needing a manual re-run.
set -u

attempts=4
for i in $(seq 1 "$attempts"); do
  if changeset version; then
    exit 0
  fi
  if [ "$i" -lt "$attempts" ]; then
    echo "changeset version failed (attempt $i/$attempts) — retrying in 5s…" >&2
    sleep 5
  fi
done

echo "changeset version failed after $attempts attempts" >&2
exit 1
