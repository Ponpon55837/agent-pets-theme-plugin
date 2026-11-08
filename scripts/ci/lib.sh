# shellcheck shell=bash
# Shared by the release workflow's scripts; sourced, never run.

# The root of the checkout these scripts belong to.
# shellcheck disable=SC2034 # used by the scripts that source this file
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# Prints a GitHub error annotation and exits.
fail() {
  echo "::error::$*" >&2
  exit 1
}

# v<semver> without build metadata (the catalog's package file names exclude "+").
require_tag() {
  local pattern='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$'
  [[ "${TAG:-}" =~ $pattern ]] || fail "Release tags are v<semver> without build metadata, such as v1.2.3."
}

# The catalog branch for an archive: publish/<id>-<version>.
publish_branch() {
  local name=${1##*/}
  echo "publish/${name%.agentpet-plugin}"
}

# Appends name=value to the step outputs when the step has them.
set_output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1=$2" >> "$GITHUB_OUTPUT"; fi
}
