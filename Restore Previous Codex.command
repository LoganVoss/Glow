#!/bin/zsh
set -u
REPO_ROOT="${0:A:h}"
cd "$REPO_ROOT" || exit 1
print 'Keep this Terminal window open. The immediately previous Codex build will be restored after you quit.'
/usr/bin/python3 scripts/install.py --wait restore "$@"
result=$?
if [[ -t 0 ]]; then read '?Press Return to close this window.'; fi
exit "$result"
