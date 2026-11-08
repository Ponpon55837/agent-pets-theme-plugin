#!/usr/bin/env bash
# Adds a verified package to a catalog checkout and commits it on the
# publish/<id>-<version> branch. The commit is deterministic (fixed author,
# message and dates), so the same base and package always give the same commit.
# Outputs branch and tree.
#
# Usage: catalog-prepare.sh <catalog checkout> <archive> <published at>
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

[ $# -eq 3 ] || fail "usage: catalog-prepare.sh <catalog checkout> <archive> <published at>"
catalog=$1
archive=$2
published_at=$3
name=${archive##*/}
branch=$(publish_branch "$name")

[ -d "$catalog/packages" ] && [ ! -L "$catalog/packages" ] || fail "The catalog has no packages/ directory."
[ ! -e "$catalog/packages/$name" ] && [ ! -L "$catalog/packages/$name" ] || fail "packages/$name is already in the catalog; published packages are immutable."
cp "$archive" "$catalog/packages/$name"
node "$REPO_ROOT/scripts/catalog-merge.ts" --index "$catalog/index.json" --archive "$catalog/packages/$name" --published-at "$published_at"

git_catalog() {
  git -C "$catalog" -c core.hooksPath=/dev/null -c commit.gpgSign=false \
    -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' "$@"
}
git_catalog switch --quiet -c "$branch"
git_catalog add -- index.json "packages/$name"
[ "$(git_catalog diff --cached --name-only | sort | tr '\n' ' ')" = "index.json packages/$name " ] || fail "The catalog change touches more than index.json and packages/$name."
message=$(node "$REPO_ROOT/scripts/release-text.ts" commit --archive "$archive")
GIT_AUTHOR_DATE=$published_at GIT_COMMITTER_DATE=$published_at git_catalog commit --quiet -m "$message"
git_catalog show --stat --format='%H %s' HEAD
set_output branch "$branch"
set_output tree "$(git_catalog rev-parse 'HEAD^{tree}')"
