#!/usr/bin/env bash
# Cut a Diffity release: bump from the latest published version, create the
# matching annotated tag on HEAD and push it to origin (nilbuild/diffity). The
# tag fires .github/workflows/release.yml, which builds, signs, notarises, and
# publishes the release with the auto-update manifest beside it.
set -euo pipefail

BUMP="${1:?usage: scripts/release.sh patch|minor|major [notes]}"
REPO="nilbuild/diffity"
BRANCH="main"
DEFAULT_NOTES="Download the universal .dmg (runs on Apple Silicon and Intel). The app updates itself after install."

# Release notes for the GitHub release body. Pass as the second arg, or leave it
# off to be prompted (type the notes, then Ctrl-D on a blank line to finish).
# When left empty the default download blurb is used.
NOTES="${2:-}"
if [ -z "$NOTES" ] && [ -t 0 ]; then
  echo "Release notes (end with Ctrl-D on a blank line, or Ctrl-D now to skip):" >&2
  NOTES=$(cat)
fi
if [ -z "$NOTES" ]; then
  NOTES="$DEFAULT_NOTES"
fi

case "$(git remote get-url origin 2>/dev/null || true)" in
  *"$REPO"|*"$REPO.git") ;;
  *)
    echo "origin is not $REPO — the tag would not reach the release workflow." >&2
    exit 1
    ;;
esac

# The build checks out the tagged commit, so anything still sitting here is not
# in the release, and a tag on an unpushed commit would build something nobody
# can see in main.
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty — commit or stash before releasing." >&2
  exit 1
fi
git fetch --quiet origin "$BRANCH"
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "HEAD is not origin/$BRANCH — push your changes before releasing." >&2
  exit 1
fi

# Only a 404 means there is no release yet. Anything else (not logged in, no
# network, a rate limit) is not an answer, and treating it as "v0.0.0" would
# go on to tag a version that already shipped.
ERR=$(mktemp)
trap 'rm -f "$ERR"' EXIT
if ! CUR=$(gh api "repos/$REPO/releases/latest" -q .tag_name 2>"$ERR"); then
  if ! grep -q "HTTP 404" "$ERR"; then
    echo "Could not read the latest release of $REPO:" >&2
    cat "$ERR" >&2
    exit 1
  fi
  CUR="v0.0.0"
fi
CUR="${CUR#v}"

NEW=$(python3 - "$CUR" "$BUMP" <<'PY'
import sys
cur, bump = sys.argv[1], sys.argv[2]
maj, mn, pa = (int(x) for x in (cur.split(".") + ["0", "0", "0"])[:3])
if bump == "major": maj, mn, pa = maj + 1, 0, 0
elif bump == "minor": mn, pa = mn + 1, 0
elif bump == "patch": pa = pa + 1
else: sys.exit("bump must be patch, minor, or major")
print(f"{maj}.{mn}.{pa}")
PY
)

# Checked before anything is written, on GitHub and here: a tag that exists
# already either shipped or is on its way to.
if gh api "repos/$REPO/git/ref/tags/v$NEW" >/dev/null 2>"$ERR"; then
  echo "v$NEW is already tagged on $REPO." >&2
  exit 1
fi
if ! grep -q "HTTP 404" "$ERR"; then
  echo "Could not check whether v$NEW is already tagged on $REPO:" >&2
  cat "$ERR" >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/v$NEW" >/dev/null; then
  echo "v$NEW already exists as a local tag — delete it (git tag -d v$NEW) or release the next version." >&2
  exit 1
fi

echo "Releasing v$NEW (was v$CUR) from $(git rev-parse --short HEAD)"

# The annotated tag carries the release notes; the workflow reads them back as
# the GitHub release body, and GitHub shows them against the tag.
git tag -a "v$NEW" -m "$NOTES"
if ! git push origin "refs/tags/v$NEW"; then
  git tag -d "v$NEW" >/dev/null
  echo "Could not push v$NEW to origin; the local tag was removed." >&2
  exit 1
fi
echo "Tagged $REPO v$NEW"
echo "Build: https://github.com/$REPO/actions"
