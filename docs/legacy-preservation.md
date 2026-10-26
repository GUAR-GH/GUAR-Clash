# Historical GPL versions and Corresponding Source

Current status (26 October 2026): the owner deleted the original repository and
created a new empty repository at the same URL. Restoration is deferred. The
previously created legacy branch, protection rules and eight release records are
no longer accessible there. Local Git history and a working-tree snapshot were
preserved for recovery. Historical links in the index are metadata, not proof of
current availability. New closed distribution stays blocked until recovery and
the per-binary Corresponding Source verification are complete.

Historical GPL versions retain their original license. Existing public source,
branches, tags, release notes and release assets must remain accessible. Do not
rewrite or delete history, move tags, remove GPL notices, replace GPL binaries with
newly licensed ones, or claim that a private rewrite relicenses older versions.

The recreated default branch is a product page. This does not replace the required
historical source archive, release materials or GPL obligations.

Before changing the current public tree, preserve the legacy default-branch tip
under a clearly named protected legacy branch, keep all existing tags and releases,
and verify the old source remains navigable. Record actual ref names and commit
IDs in a reviewed source index; this template does not create or verify such refs.
If old changelog content is being replaced on the default branch, retain the exact
record in the legacy branch and link it from the product changelog.

For **each** previously distributed binary asset, record its checksum, exact
release/version/target, and complete matching Corresponding Source. A nearby tag
or generic upstream homepage does not establish that the source matches the
binary. Check the actual build inputs, including uncommitted changes. If a release
was built from a dirty working tree, recover and preserve the exact dirty source
snapshot and build inputs. When that snapshot is unavailable, record the gap and
block the new closed release; do not mark source coverage complete by assumption.

Include the required build/install scripts, patches, lockfiles, generated-source
inputs, applicable notices and licenses. For bundled GPL engine or helper binaries,
preserve the exact upstream revision and source, local modifications, patches,
build scripts and required installation information. Track components separately;
a client source archive alone may not cover a bundled engine. Review the license
requirements of the actual distributed versions and delivery method with qualified
counsel, and keep the corresponding materials available for the applicable period.

Repository-generated source ZIPs cover only committed tree contents. They do not
automatically contain dirty changes, unavailable build inputs, omitted submodules,
Git LFS objects or complete sources for embedded third-party binaries. Keep
verified, complete source bundles alongside the affected releases when needed.

The [legacy source index](../legal/legacy-source-index.json) contains observed public
release/tag/asset metadata for eight releases. All remain **unverified**. It records
GitHub-reported digests as metadata; no downloaded asset hashes, exact binary build
inputs or Corresponding Source have been certified. The v1.4.0, 1.5.0 and 1.5.3 tags
were observed pointing to the same commit, which requires independent per-release
source matching. Releases with no currently listed assets also require checking
whether binaries were previously distributed or removed. Complete the work queue
from inspected artifacts and exact build records, retain the evidence, and review
every release before changing its status. No claim of complete source coverage is
made by this template.
