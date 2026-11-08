#!/usr/bin/env bash
# Fails unless the release tag still points to the commit this run started
# from and that commit is on main. The tag is resolved through the API
# (annotated tags included), so no history is needed in the checkout. Outputs
# tag_object (the annotated tag object, empty for a lightweight tag) and
# published_at (the tagger date, or the commit date for a lightweight tag).
#
# Usage: check-ref.sh    Env: TAG, GITHUB_SHA, GITHUB_REPOSITORY, GH_TOKEN
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

require_tag
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail "GITHUB_SHA is not a commit id."
api="repos/$GITHUB_REPOSITORY"

ref=$(gh api "$api/git/ref/tags/$TAG" --jq '.object.type + " " + .object.sha') || fail "Tag $TAG does not exist."
read -r type object <<< "$ref"
tag_object=''
published_at=''
# A tag can point to another tag; follow a few levels.
for _ in 1 2 3 4; do
  [ "$type" = tag ] || break
  info=$(gh api "$api/git/tags/$object" --jq '.object.type + " " + .object.sha + " " + .tagger.date') || fail "Cannot read tag $TAG."
  if [ -z "$tag_object" ]; then
    tag_object=$object
    published_at=${info##* }
  fi
  read -r type object _ <<< "$info"
done
[ "$type" = commit ] || fail "Tag $TAG does not point to a commit."
[ "$object" = "$GITHUB_SHA" ] || fail "Tag $TAG moved after this run started: it points to $object, the run to $GITHUB_SHA."

# "behind" or "identical": the commit is main or one of its ancestors.
status=$(gh api "$api/compare/main...$GITHUB_SHA" --jq .status) || fail "Cannot compare $GITHUB_SHA with main."
case "$status" in
  identical | behind) ;;
  *) fail "Tag $TAG points to a commit that is not on main." ;;
esac

if [ -z "$published_at" ]; then
  published_at=$(gh api "$api/commits/$GITHUB_SHA" --jq .commit.committer.date) || fail "Cannot read the date of $GITHUB_SHA."
fi
[[ "$published_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail "Unexpected tag date for $TAG."
[[ "$tag_object" =~ ^([0-9a-f]{40})?$ ]] || fail "Unexpected tag object for $TAG."
echo "Tag $TAG points to $GITHUB_SHA on main (published at $published_at)."
set_output tag_object "$tag_object"
set_output published_at "$published_at"
