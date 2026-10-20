# Third-party components and redistribution notes

Salmon Review's own code is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This choice does not change the licenses of dependencies, game assets, or user data.

## Components used by the application

| Component | Locked version | License / source | How it is used |
| --- | --- | --- | --- |
| nxapi | 1.6.1-next.257 | AGPL-3.0-or-later; [source](https://github.com/samuelthomas2774/nxapi/tree/47c9d35d9d51d33e62dd6d3733b616e0ad31b02b) | Published CLI entry point handles authentication, native cache and collection. A local preload adapter changes the SplatNet request language to zh-CN. |
| @salmon-review/splatnet3-compat | 1.0.0 (local replacement for splatnet3-types) | AGPL-3.0-or-later; [source and provenance](packages/splatnet3-compat/README.md) | Supplies runtime query IDs and enums to the pinned nxapi. Historical nxapi enum attribution and license are retained; query IDs are independently verified protocol constants. |
| undici | 6.28.1 | MIT; [source](https://github.com/nodejs/undici) | HTTP client used by nxapi. |
| sharp | 0.35.5 (override under nxapi) | Apache-2.0; [source](https://github.com/lovell/sharp) | nxapi dependency for presence-image rendering; Salmon Review does not invoke this feature. Native bundled libraries have additional notices in their packages. |
| uuid | 11.1.1 (override under node-notifier) | MIT; [source](https://github.com/uuidjs/uuid) | Preserves the CommonJS v4 API used by node-notifier. Salmon Review does not send desktop notifications. |
| Node.js / Node Docker image | 22.23.2 / bookworm-slim | [Node licenses](https://github.com/nodejs/node/blob/v22.23.2/LICENSE), [image source](https://github.com/nodejs/docker-node) | Runtime, built-in SQLite and base operating system. |

The nxapi npm archive is [nxapi-1.6.1-next.257.tgz](https://registry.npmjs.org/nxapi/-/nxapi-1.6.1-next.257.tgz); npm reports source revision `47c9d35d9d51d33e62dd6d3733b616e0ad31b02b`. Overrides alter the resolved dependencies, not the published nxapi executable. The wrapper and language adapter are part of this repository's source.

## Dependency inventory and shipped notices

[THIRD_PARTY_PACKAGES.json](THIRD_PARTY_PACKAGES.json) lists every locked npm package, including platform-specific optional packages, with version, declared license, archive URL and integrity hash. It is generated from `package-lock.json` by `npm run notices`; `npm run notices:check` prevents the inventory from drifting.

The Docker build generates `/app/third-party/installed-packages.json` and copies the installed packages' LICENSE / COPYING / NOTICE / copyright files to `/app/third-party/licenses/`. This includes nested vendor notices, such as node-notifier's native helpers and sharp's native libraries. If a package ships license information only in a README, that README is retained. Original notices also remain inside `node_modules`.

This bundle describes npm packages installed in that image, not all operating-system packages. Node's own notices are shipped with Node; Debian package copyright files are retained under `/usr/share/doc/` where provided by the base image. Before distributing a public image, also verify base-image/native-library notices and corresponding-source obligations for the exact image. The package inventory alone is not a complete source offer or legal clearance.

## Replaced dependency

The independently published `splatnet3-types` package is no longer installed or included in new builds. Its redistribution permission was not established; this change does not claim that it inherited nxapi's license. npm resolves the historical import name to the local `@salmon-review/splatnet3-compat` package before installation. See its [NOTICE](packages/splatnet3-compat/NOTICE) and [per-constant provenance](packages/splatnet3-compat/provenance.json). No code, type declarations, generated query implementations or source maps from the separate package are copied into the adapter. nxapi's own authentication, refresh and coop export implementation remains unchanged. Older release images are not changed by this source update.

## Explicit unresolved upstream notice gaps

- **tr46 0.0.3:** package metadata declares MIT but the npm archive omits the license text and README. The bundle retains its original package.json and marks the evidence `metadata-only`. Obtain the applicable copyright/license notice before treating the image notice bundle as complete.
- **cli-table 0.3.11:** package metadata omits a license field, but the published LICENSE explicitly grants MIT. The generator records this version-specific reviewed exception.

No upstream author has been contacted by this project as part of this review. These gaps are not resolved by placing an AGPL license on Salmon Review.

## Artwork and login-guide inspiration

Nintendo game names, artwork and trademarks belong to their respective owners. They are not covered by Salmon Review's license. No Nintendo artwork or personal battle records are committed to this repository. Referenced Nintendo PNG images may be cached locally when a user imports or synchronizes their own records.

Player names use a bundled M PLUS Rounded 1c ExtraBold fallback (Copyright 2016 The Rounded M+ Project Authors, SIL OFL 1.1). The font and its license are in `dist/fonts/`. On displaying a nameplate, the browser also attempts to load the community-hosted Splatfont source used by Conch Bay, pinned to a specific revision. That optional game-style font is not bundled or licensed by this project; unavailable remote fonts fall back locally. See [font sources](dist/fonts/README.md). Nameplate measurements were informed by Conch Bay's MIT-licensed `Splashtag.tsx`; the HTML/CSS implementation and text fitting are written for this project.

The login instructions were inspired by [Cypas/splatoon3-nso](https://github.com/Cypas/splatoon3-nso). The schematic is written in this project's HTML/CSS; that project's authentication implementation and screenshot assets are not bundled. s3s and the stargazing tutorial's server are not runtime dependencies.

This is an independent local tool, not affiliated with or endorsed by Nintendo. The repository remains private during preparation. A private prerelease image is provided at the maintainer's request, together with matching application source, nxapi source, npm notices and Debian package notices/version inventory. The upstream notice gaps above remain unresolved; publication of the private attachment is not a statement of complete redistribution clearance. No public release image has been published. Before changing visibility or distributing an image, follow [BETA_TESTING.md](BETA_TESTING.md) and resolve the relevant rights and source-distribution requirements.
