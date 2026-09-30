#!/usr/bin/env bash
# Runs scripts/release.sh against stand-ins for git and gh, so what it does
# when GitHub will not answer can be checked without cutting a release.
#   bash scripts/release.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

run() {
  local scenario="$1"
  local sandbox
  sandbox="$(mktemp -d)"
  mkdir -p "$sandbox/bin"

  cat >"$sandbox/bin/git" <<'STUB'
#!/usr/bin/env bash
echo "git $*" >>"$CALLS"
case "$SCENARIO:$*" in
  wrongorigin:"remote get-url origin") echo "git@github.com:someone/fork.git" ;;
  *:"remote get-url origin") echo "git@github.com:nilbuild/diffity.git" ;;
  dirty:"status --porcelain") echo " M README.md" ;;
  *:"status --porcelain") ;;
  behind:"rev-parse origin/main") echo def5678def5678 ;;
  *:"rev-parse --short HEAD") echo abc1234 ;;
  localtag:"rev-parse -q --verify"*) echo abc1234abc1234 ;;
  *:"rev-parse -q --verify"*) exit 1 ;;
  *:rev-parse*) echo abc1234abc1234 ;;
  pushfails:push*) echo "rejected" >&2; exit 1 ;;
esac
STUB

  cat >"$sandbox/bin/gh" <<'STUB'
#!/usr/bin/env bash
echo "gh $*" >>"$CALLS"
case "$SCENARIO:$*" in
  offline:*) echo "error connecting to api.github.com" >&2; exit 1 ;;
  *"releases/latest"*)
    if [ "$SCENARIO" = "first" ]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi
    echo "v0.0.10" ;;
  taken:*"git/ref/tags/"*) echo '{"ref":"x"}' ;;
  *"git/ref/tags/"*) echo "gh: Not Found (HTTP 404)" >&2; exit 1 ;;
  *) echo "sha" ;;
esac
STUB
  chmod +x "$sandbox/bin/git" "$sandbox/bin/gh"

  : >"$sandbox/calls"
  PATH="$sandbox/bin:$PATH" SCENARIO="$scenario" CALLS="$sandbox/calls" \
    bash "$HERE/release.sh" "${2:-patch}" "${3-notes}" </dev/null >"$sandbox/out" 2>&1
  STATUS=$?
  CALLS_MADE="$(cat "$sandbox/calls")"
  OUTPUT="$(cat "$sandbox/out")"
  rm -rf "$sandbox"
}

expect() {
  local name="$1"
  shift
  if "$@"; then
    echo "ok   $name"
    return
  fi
  echo "FAIL $name"
  echo "$OUTPUT" | sed 's/^/     /'
  FAILED=1
}

wrote_nothing() {
  ! grep -q -- "git tag\|git push" <<<"$CALLS_MADE"
}

run offline
expect "an unreachable GitHub stops the release" test "$STATUS" -ne 0
expect "an unreachable GitHub writes nothing" wrote_nothing

run taken
expect "a tag that already exists on GitHub stops the release" test "$STATUS" -ne 0
expect "a tag that already exists on GitHub writes nothing" wrote_nothing

run localtag
expect "a tag that already exists locally stops the release" test "$STATUS" -ne 0
expect "a tag that already exists locally writes nothing" wrote_nothing

run dirty
expect "a dirty tree stops the release" test "$STATUS" -ne 0
expect "a dirty tree writes nothing" wrote_nothing

run behind
expect "a HEAD that is not origin/main stops the release" test "$STATUS" -ne 0
expect "a HEAD that is not origin/main writes nothing" wrote_nothing

run wrongorigin
expect "an origin that is not nilbuild/diffity stops the release" test "$STATUS" -ne 0
expect "an origin that is not nilbuild/diffity writes nothing" wrote_nothing

run first
expect "no release yet starts from v0.0.1" grep -q "Releasing v0.0.1" <<<"$OUTPUT"
expect "no release yet goes on to tag" test "$STATUS" -eq 0

run normal
expect "a patch bumps from the latest release" grep -q "Releasing v0.0.11" <<<"$OUTPUT"
expect "a patch creates an annotated tag with the notes" grep -q "git tag -a v0.0.11 -m notes" <<<"$CALLS_MADE"
expect "a patch pushes the tag to origin" grep -q "git push origin refs/tags/v0.0.11" <<<"$CALLS_MADE"

run normal minor
expect "a minor bumps the middle number" grep -q "Releasing v0.1.0" <<<"$OUTPUT"

run normal major
expect "a major bumps the first number" grep -q "Releasing v1.0.0" <<<"$OUTPUT"

run normal patch ""
expect "empty notes fall back to the download blurb" grep -q "git tag -a v0.0.11 -m Download the universal" <<<"$CALLS_MADE"

run pushfails
expect "a failed push fails the release" test "$STATUS" -ne 0
expect "a failed push removes the local tag" grep -q "git tag -d v0.0.11" <<<"$CALLS_MADE"

exit "$FAILED"
