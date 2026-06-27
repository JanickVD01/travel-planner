#!/usr/bin/env bash
# The ONLY sanctioned push: fast-forward-only, refuses main/HEAD, refuses flag-like or
# refspec/space branch names, and never --force. Usage: scripts/pr-safe-push.sh <branch>
set -euo pipefail
BRANCH="${1:-}"
[ -z "$BRANCH" ] && { echo "a branch name is required" >&2; exit 2; }
case "$BRANCH" in
  -*)        echo "refusing flag-like branch: $BRANCH" >&2; exit 2 ;;
  main|HEAD) echo "refusing to push '$BRANCH' — main is off-limits" >&2; exit 2 ;;
  *:*|*' '*) echo "refusing refspec/space in branch: $BRANCH" >&2; exit 2 ;;
esac
exec git push origin "refs/heads/${BRANCH}:refs/heads/${BRANCH}"
