#!/usr/bin/env bash
# Pushes the prepared catalog branch and opens its pull request. A re-run
# reuses what an earlier attempt pushed when the branch holds the same tree,
# and an open pull request for it; a branch with other content fails. The
# token reaches git only through gh's credential helper for this one command,
# never in a URL, an argument or a config file.
#
# Usage: catalog-pr.sh <catalog checkout> <branch> <title file> <body file>
# Env: GH_TOKEN (the catalog token), CATALOG_REPO
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

[ $# -eq 4 ] || fail "usage: catalog-pr.sh <catalog checkout> <branch> <title file> <body file>"
[ -n "${GH_TOKEN:-}" ] || fail "The release environment has no CATALOG_PR_TOKEN secret."
catalog=$1
branch=$2
title=$(cat "$3")
body=$4

git_auth() {
  git -C "$catalog" -c core.hooksPath=/dev/null -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"
}
head=$(git -C "$catalog" rev-parse HEAD)
remote=$(git_auth ls-remote origin "refs/heads/$branch" | cut -f1)
if [ -z "$remote" ]; then
  git_auth push origin "HEAD:refs/heads/$branch"
elif [ "$remote" = "$head" ]; then
  echo "Branch $branch is already pushed."
else
  git_auth fetch --quiet --no-tags --depth=1 origin "refs/heads/$branch"
  if [ "$(git -C "$catalog" rev-parse 'FETCH_HEAD^{tree}')" != "$(git -C "$catalog" rev-parse 'HEAD^{tree}')" ]; then
    fail "Branch $branch already exists in $CATALOG_REPO with other content. If it is stale, close its pull request, delete the branch and re-run this job."
  fi
  echo "Branch $branch already holds this change; reusing it."
fi

pr=$(gh pr list --repo "$CATALOG_REPO" --head "$branch" --base main --state open --json url --jq '.[0].url // empty')
if [ -n "$pr" ]; then
  echo "The pull request is already open: $pr"
  exit 0
fi
gh pr create --repo "$CATALOG_REPO" --base main --head "$branch" --title "$title" --body-file "$body"
