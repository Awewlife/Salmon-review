# Development validation — 2026-09-20

## Verified

- Windows host: Node 22.19.0; Docker Desktop Linux engine 28.5.1.
- Docker image built from the lockfile, runs as the `node` user, health check succeeds, published address is `127.0.0.1:8787`.
- Empty first-run screen and data management controls exercised in the browser.
- A real detail was imported through the file picker before its summary; subsequent summary import resolved its shift.
- All 50 existing records imported locally. 50/50 personal eggs, assists, kills, power eggs, rescues and rescued counts, plus team boss kills, matched original JSON. The two shifts retain 22/22 and 28/45 coverage.
- Container restart and image recreation retained all 50 records. A 51-document backup merged through the browser with zero duplicates.
- Public nxapi adapter fetched the live history list and one detail using the existing unexpired local SplatNet cache; Simplified Chinese stage name matched the earlier export. This did not test a new login or expired-token refresh.
- Automated tests cover persistence, deduplication, atomic account validation, unsupported/incomplete records, special attribution, backup/restore, credential encryption, request-origin protection, sync locking, progress retention, backoff, pause states and authorization state validation.

## Still requires validation before a general release

- Register/configure an independent nxapi-auth client, then exercise fresh Nintendo authorization and expired-credential renewal.
- Ask another player to install on a clean machine and connect their own account.
- Additional actual datasets for unusual modes; these remain excluded from regular-mode statistics.
- Select the project-wide redistribution license and finish dependency notices before distributing a public image.
- Very large archives: current browser import limit is 60 MB; streaming import and paginated history are not implemented.

Personal records, cache credentials and backups used during validation are outside the repository. No authentication values were included in command output or commits.
