.PHONY: patch minor major test-release

# Cut a release. Tags HEAD (which must be origin/main) and pushes the tag to
# nilbuild/diffity; .github/workflows/release.yml then builds, signs, notarises,
# and publishes the release with auto-update metadata.
#   make patch   x.y.z -> x.y.(z+1)
#   make minor   x.y.z -> x.(y+1).0
#   make major   x.y.z -> (x+1).0.0
patch minor major:
	@bash scripts/release.sh $@

test-release:
	@bash scripts/release.test.sh
