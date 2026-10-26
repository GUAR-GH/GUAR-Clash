# Release policy

No new closed release may be published until maintainers approve evidence for:

- Independent implementation provenance and rights to distribute every component.
- A dependency/license inventory, required notices and corresponding source for
  every component whose license requires it.
- Preservation and verified availability of the complete Corresponding Source for
  each historical GPL release and all previously distributed GPL binaries.
- Explicit feature coverage and known limitations compared with the older product.
- Security review, installer/archive inspection and credential scanning.
- Actual installation and operation on every advertised OS and architecture.
- Windows signing, macOS signing/notarization and final installer checksum records.
- A reviewed release-readiness report and protected-environment human approval.

The current default branch keeps the historical GPL implementation while these
gates remain unresolved. A future product-documentation default branch requires
a separate approved migration that preserves accessible legacy source refs.

Builds occur in a separate private repository at one immutable commit. A separate
publication job receives only approved installer files, checksums and required
notices. It never checks out the private source. The new public tag must point to
a product-documentation commit already in this public repository. Private source
commits, Git history, source archives, maps, debug output and build credentials from
the new independent client are not copied to the public repository. Historical GPL
source and all materials required by its license remain publicly available.

Electron ASAR files contain readable JavaScript. They are packaging, not encryption.
Public installers necessarily contain executable client code. The absence of a
separate source download does not prevent recovery of that JavaScript, and cannot
change any license obligations.

Automation defaults to leaving a draft prerelease after every gate passes. An
explicit publish option may make the verified release visible only after the full
native build matrix, real protected-environment verification and human approval.
Preview versions remain prereleases; stable versions may be marked latest. A planned
format, locally passing unit test, or successful cross-build is not native testing.
macOS PKG support is not assumed; the independent plan uses DMG on both architectures.
