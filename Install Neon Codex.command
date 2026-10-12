#!/bin/zsh
set -u
REPO_ROOT="${0:A:h}"
cd "$REPO_ROOT" || exit 1
print 'Keep this Terminal window open. Codex will not be quit or reopened automatically.'
/usr/bin/python3 scripts/install.py --wait install "$@"
result=$?
if [[ -t 0 ]]; then read '?Press Return to close this window.'; fi
exit "$result"
