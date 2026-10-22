# Source materials and rebuilding

This document accompanies the Linux/amd64 and Linux/arm64 release images. Each release
provides the application source ZIP and a third-party ZIP. The latter contains
installed license notices, Debian copyright files, and `sources/` with the
source archives and patches listed in `release-sources.json`.

The index records upstream locations, revisions or versions, byte sizes and
SHA-256 values. `imageInventory` (amd64) and `platformInventories` (arm64) identify the installed Debian source/binary
versions and the versions reported by Node, sharp and nxapi. Packaging stops if
that inventory or any source file differs. This is a copy of source materials,
not merely a promise to provide them later.

## Application and nxapi

Use the application source ZIP matching the image's
`org.opencontainers.image.revision` label. On a machine with Docker:

```sh
docker build --platform linux/amd64 --build-arg VCS_REF=<commit> -t salmon-review:0.4.0 .
```

For Apple Silicon, use `--platform linux/arm64` and package with the same
`--platform linux/arm64` option. Build/package the architectures separately;
the Windows and Intel Mac installers share the amd64 image. The base digest
is a multi-architecture index; both images use the same application source.

The Dockerfile pins its base digest and security updates. npm dependencies and
their integrity hashes are locked in `package-lock.json`. The local
`packages/splatnet3-compat` source and provenance are included. The build
requires access to the image registry, Debian repositories and npm. It is not
an offline or byte-for-byte reproducibility guarantee.

nxapi's preferred TypeScript source is supplied under `sources/upstream/`,
at revision `47c9d35d9d51d33e62dd6d3733b616e0ad31b02b`, matching the locked npm
release. Its own package scripts, configuration and README describe rebuilding.
The language adapter, process wrapper and local compatibility module are in
the application source; nxapi's published executable is not patched.

## Node and the base system

`sources/upstream/node-v22.23.2.tar.xz` contains Node's source, bundled library
sources, licenses and `BUILDING.md`. Follow that document to build Node on
the matching Linux architecture. The Docker Node recipe source is also included for reference.
The final image excludes npm, Corepack and Yarn; they are used during building
only. Removed files are not retained in the final image's lower layers.

`sources/debian/` contains each installed Debian source package's `.dsc`,
original archives and Debian changes, or its native source archive. These
include Debian build rules and patches. On a suitable Debian build machine,
install `dpkg-dev` and the package's build dependencies, then use:

```sh
dpkg-source -x <package>.dsc
cd <extracted-source>
dpkg-buildpackage -b -uc -us
```

Use the exact versions in the index; packages may have an epoch in their
version that does not appear in archive filenames. Build prerequisites are
listed in each source package's `debian/control`. The Debian archives were
identified through signed APT source indexes and checked against their
SHA-256 values.

## sharp and libvips

The `sources/upstream/` archives include sharp 0.35.5 and sharp-libvips 1.3.4
source trees, including build scripts and platform configuration. The native
dependency archives and patches used by the latter's `build/posix.sh` are in
`sources/native/`. Their source locations are tied to that script in the
index. Preserve the listed patches when rebuilding; the LGPL and other
upstream license notices remain with the source and installed libraries.

On a Linux build machine, unpack sharp-libvips and follow its README:
`./build.sh linux-x64` or `./build.sh linux-arm64`. Its script sets the library versions and build options.
The librsvg Rust crate sources are also supplied under `sources/rust/`, verified
against its Cargo.lock checksums. The supplied archives can be substituted for its network fetches using the
index; the original script may also fetch build tools. Build sharp's Node
addon from its supplied source using the matching Node headers and rebuilt
libvips, following sharp's installation/build documentation in that tree.

The application uses a dynamically linked Linux/glibc addon for x64 or arm64. It does not
ship the musl or statically linked WebAssembly variants. A compatible rebuilt
library can replace
`/app/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*` in a custom
image; a rebuilt addon can replace
`/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node`.
For arm64, substitute `arm64` for `x64` in these package and file paths.
No application signing key is needed to build or run a modified image.
Use your own Compose image setting; the official web updater accepts only
official signed releases and is not the installation mechanism for modified
builds.

## Updating the source lock

After changing the base system or native dependencies, review their source
versions and build scripts again. Obtain the corresponding source archives
and patches from upstream or signed Debian source indexes. Update the
version inventory, file sizes and SHA-256 values in `release-sources.json`.
Do not retain an old lock merely because an archive has the same filename.

Collect and verify the locked files before packaging:

```sh
python scripts/collect-release-sources.py --image salmon-review:0.4.0 --output ../source-cache
python scripts/package-release.py --sources ../source-cache --output ../release
```

Fonts, Nintendo images and user data have separate provenance and rights,
described in `THIRD_PARTY_NOTICES.md`; they are not relicensed by this document.
