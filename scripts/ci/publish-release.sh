#!/usr/bin/env bash
# Creates the GitHub Release for TAG with the given assets, or accepts the one
# an earlier attempt left: every asset already attached must equal its local
# file byte for byte and nothing else may be attached. Missing assets are
# uploaded and a draft is published; any other difference fails.
#
# Usage: publish-release.sh <title> <notes file> <asset>...
# Env: TAG, GITHUB_REPOSITORY, GH_TOKEN
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

[ $# -ge 3 ] || fail "usage: publish-release.sh <title> <notes file> <asset>..."
require_tag
title=$1
notes=$2
shift 2
repo=$GITHUB_REPOSITORY

# Drafts are listed too: a create that failed while uploading can leave one.
ids=$(gh api --paginate "repos/$repo/releases" --jq ".[] | select(.tag_name == \"$TAG\") | .id")
count=$(grep -c . <<< "$ids" || true)
if [ "$count" -eq 0 ]; then
  gh release create "$TAG" --repo "$repo" --verify-tag --title "$title" --notes-file "$notes" "$@"
  exit 0
fi
[ "$count" -eq 1 ] || fail "$count releases use tag $TAG; delete all but one."
[[ "$ids" =~ ^[0-9]+$ ]] || fail "Unexpected release id for $TAG."

existing="$RUNNER_TEMP/existing-release"
rm -rf "$existing"
mkdir -p "$existing"
attached=$(gh api --paginate "repos/$repo/releases/$ids/assets" --jq '.[] | .name + "\t" + .state')
if [ -n "$attached" ]; then
  while IFS=$'\t' read -r name state; do
    known=false
    for file in "$@"; do
      if [ "$(basename "$file")" = "$name" ]; then known=true; fi
    done
    "$known" || fail "Release $TAG has an unexpected asset $name; it is not this run's release."
    [ "$state" = uploaded ] || fail "Release $TAG has an incomplete asset $name ($state); delete that asset and re-run."
  done <<< "$attached"
  gh release download "$TAG" --repo "$repo" --dir "$existing"
fi
missing=()
for file in "$@"; do
  name=$(basename "$file")
  if [ -e "$existing/$name" ]; then
    cmp -s "$existing/$name" "$file" || fail "Release $TAG already has $name with different content; published releases are not replaced."
  else
    missing+=("$file")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Release $TAG exists; uploading the missing assets."
  gh release upload "$TAG" --repo "$repo" "${missing[@]}"
fi
if [ "$(gh api "repos/$repo/releases/$ids" --jq .draft)" = true ]; then
  echo "Publishing the draft release $TAG."
  gh release edit "$TAG" --repo "$repo" --draft=false
fi
echo "Release $TAG has exactly this run's assets."
