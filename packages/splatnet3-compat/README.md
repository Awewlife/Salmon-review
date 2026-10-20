# SplatNet runtime compatibility adapter

This local package replaces `splatnet3-types` **only for the compiled nxapi
version pinned by Salmon Review**. npm installs it under that import name;
its own package name is `@salmon-review/splatnet3-compat`. It provides the
`splatnet3-types/splatnet3` runtime entry point. It is not a TypeScript types
package and cannot be used to rebuild nxapi or as a general replacement
for other consumers of splatnet3-types.

nxapi remains responsible for Nintendo Account/NSO authentication, saved
sessions, renewal, remote configuration, query upgrades and result exports.
The supported application path is login and `splatnet3 dump-results --coop
--no-battles --auto-update-session`. No authentication implementation or
nxapi executable is patched.

## Sources and scope

- `queries.json`: 82 operation name/hash pairs independently extracted from
  the official public web bundle identified in `provenance.json`, using its
  `params:{id:...,metadata:{},name:...}` records. The provenance file records
  each actual operation name, including five aliases required by nxapi.
  No GraphQL document or JavaScript implementation is copied.
- `enums.json`: five enum groups come from the AGPL-licensed nxapi source
  **before** the separate types package was introduced. The historical
  license and attribution are retained. `MINI_GAME_PLAYING`, `CoopRule` and
  `FestMatchMode` values are protocol strings independently checked in the
  official public web client. See the per-member source ledger.
- The artifact SHA-256 fingerprints and historical source commit are pinned.
  Raw upstream web bundles are research inputs, not shipped source files.
- Three obsolete operations (`FestRecordRefetchQuery`, `WeaponRecordQuery`,
  `WeaponRecordsRefetchQuery`) are absent from that bundle and have explicit
  null mappings in nxapi's public configuration for the pinned client at
  inspection time. Access throws a descriptive error before network I/O.
  No fabricated or old unverified hashes are used. These are not used by
  Salmon Review's login or coop synchronization.

The current identifiers for normal coop history/detail queries equal the
final values obtained by nxapi's old-ID upgrade mapping on 2026-10-19.
This preserves filenames for exports made with that mapping. A profile with
an older cached mapping may have older filenames; the application's normal
record-ID deduplication still applies. Future mappings continue to run in
nxapi. This adapter does not refresh or override nxapi's configuration.

Other exposed operations support nxapi module loading but are not a promise
of end-to-end support for every nxapi command. In particular, using current
protocol identifiers does not establish compatibility of every historical
response schema. The full original package API is intentionally not shipped.

## Maintaining the contract

Run `node scripts/check-splatnet-compat.mjs` and `npm test` after a clean
`npm ci`. The contract check rejects changes to the pinned nxapi version,
new import subpaths, exports, query names and enum members. It also verifies
that the lockfile resolves to the local adapter, never the upstream archive.
Do not silently expand the contract on an nxapi upgrade.

To recheck the source evidence, download the two public source artifacts
listed in `provenance.json` to temporary files and run:

```
node scripts/verify-splatnet-provenance.mjs --bundle <web-bundle.js> --types <historical-types.ts>
```

The verifier checks fingerprints, operation names/IDs and enum values. It
does not execute the downloaded JavaScript or require account credentials.
When a public artifact changes, review the change and update its source
ledger explicitly; builds and tests never scrape a live table automatically.

The adapter and adapted nxapi constants are AGPL-3.0-or-later. Protocol
identifier evidence is not a license grant for Nintendo's implementation.
Replacing this dependency does not resolve other dependencies' notice gaps.
