#!/bin/zsh
set -u
REPO_ROOT="${0:A:h}"
cd "$REPO_ROOT" || exit 1
/bin/zsh scripts/build.command "$@"
result=$?
if [[ -t 0 ]]; then read '?Press Return to close this window.'; fi
exit "$result"
