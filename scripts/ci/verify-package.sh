#!/usr/bin/env bash
# Re-checks the package the sign job handed over: the archive that this
# checkout's tag and src/plugin.json name, signed by the key pinned in
# publisher.json, with the SHA-256 the sign job measured. Outputs archive
# (the file name) and path.
#
# Usage: verify-package.sh <directory>    Env: TAG, SHA256
set -euo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"

[ $# -eq 1 ] || fail "usage: verify-package.sh <directory>"
require_tag
[[ "${SHA256:-}" =~ ^[0-9a-f]{64}$ ]] || fail "The sign job passed no SHA-256."
facts=$(node "$REPO_ROOT/scripts/release-check.ts" --tag "$TAG")
archive=$(sed -n 's/^archive=//p' <<< "$facts")
fingerprint=$(sed -n 's/^fingerprint=//p' <<< "$facts")
path="$1/$archive"
node "$REPO_ROOT/scripts/verify.ts" --require-signature --fingerprint "$fingerprint" --sha256 "$SHA256" "$path"
set_output archive "$archive"
set_output path "$path"
