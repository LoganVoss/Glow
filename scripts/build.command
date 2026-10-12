#!/bin/zsh
set -u
REPO_ROOT="${0:A:h:h}"
cd "$REPO_ROOT" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print -u2 'Neon Codex requires Node 22.12 or newer. Install Node, then reopen this launcher.'
  exit 1
fi
node scripts/build-launcher.mjs "$@"
