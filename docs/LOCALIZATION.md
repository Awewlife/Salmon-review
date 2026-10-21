# Display languages

The language selector supports Simplified Chinese, Traditional Chinese,
English, Japanese and the optional Inkling display mode. Preferences are saved
in this browser under `salmon-language-v1`; saved match data and synchronization
language are unchanged. All dates retain the application's UTC+8 time zone.

`dist/i18n-catalog.js` is the editable translation catalog. Each source message
maps to Traditional Chinese, English and Japanese, in that order. `{0}` etc.
are dynamic placeholders. Source messages are kept on DOM nodes so switching
languages does not recreate forms, change selected ranges, or lose input.
Player nicknames, name IDs and entered values must never be translated.
Splashtag titles use the dedicated game-title table described below.
Missing translations retain their source text; do not invent data or names.

Full-page translation runs when the language changes. Mutation handling processes
only changed subtrees, coalesces nested roots, and skips unchanged translated
text. Nickname matching is prepared once per data snapshot, not once per label.
Tooltip translations run before positioning so translated dimensions are used.

`dist/i18n.js` localizes the presentation and accessible attributes. All four
image exporters use the same translator. Inkling mode applies the font to the
whole interface and exports. Only other language names in the selector retain
their ordinary font. Runtime text localization requires no external API.

## Game terminology

Metric labels, meanings and official terminology sources are recorded in
[TERMINOLOGY.md](TERMINOLOGY.md). Inkling uses complete English messages before
font substitution; translating only isolated Chinese keywords is insufficient.

Only game names and title fragments (Salmon Run stages, enemies, grades, suits,
weapons and Splashtag title halves)
are included. Their corresponding identifiers and spellings were checked in
the Nintendo game-language tables indexed by Leanny/splat3:

https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/language

Tables: `CNzh.json`, `TWzh.json`, `USen.json`, `JPja.json`; groups:
`CommonMsg/Coop/{CoopEnemy,CoopGrade,CoopSkinName,CoopStageName}` and
`CommonMsg/Weapon/{WeaponName_Main,WeaponName_Special}`.
Data provided by Lean — https://github.com/Leanny/splat3.
The maintainer publicly permits data use with attribution; see
[resource rights and scope](RESOURCE_RIGHTS.md). This is not an MIT or AGPL grant
for Nintendo content. No third-party executable code or complete language database is included.
Game names remain Nintendo terminology; this project does not claim ownership.
SplatNet's abbreviated grade names are explicitly mapped as well.

### Splashtag titles and source language

`dist/byname-catalog.js` contains `CommonMsg/Byname/BynameAdjective` and
`CommonMsg/Byname/BynameSubject`, aligned by game ID in CNzh, TWzh, USen and JPja.
Rebuild it with `node scripts/build-byname-catalog.mjs <table-directory>`.
The extractor verifies the pinned Git blob hashes, removes Japanese ruby
annotations while retaining their base text, resolves alternate-form references,
and omits the orphaned `0654_1` control. No upstream executable code is copied.

Saved appearances currently contain a composed `byname` string, not fragment IDs.
The UI matches a complete adjective + subject across the four source languages,
then uses the same IDs in the requested language (English separates them with a
space). Unknown or ambiguous mappings retain the original string. This resolver
only runs on marked title nodes; it must never translate a matching nickname.
Indexes are initialized on first use and results are cached. Raw records remain
unchanged; there is no external translation request.

nxapi keeps account country and language separate; its normal read requests use
`Accept-Language`. Salmon Review's `server/nxapi-language.js`, preloaded by
`server/nxapi-cli.js` for sync and career reads, overrides that header to `zh-CN`.
Thus a US-region account does not automatically produce English records in this
application. The override does not change account country or authentication.
The UI language selector only changes presentation. Imported records can have a
different source language. A localized title identifies the request's returned
language, not the teammate's account region, game language or preferred UI.

Traditional UI text was initially converted with OpenCC and then supplemented
with the game's Traditional Chinese terminology. OpenCC is a preparation tool,
not a shipped runtime dependency. UI translations are maintained in this project.

## Inkling

Inkling v2 by eli / frozenpandaman is an ornamental Latin-character mapping,
not an official translation. It is remotely requested on demand from a pinned
revision; the font binary is not part of this repository or release bundles.
The author's non-commercial and attribution conditions continue to apply.
See `dist/fonts/INKLING-NOTICE.txt` and the visible attribution in Inkling mode.

Do not put credentials, personal records or identifiers in font URLs. Preserve
the no-referrer policy and fallback fonts. Characters absent from the font keep
their original fallback glyphs; player names and numeric values are not rewritten.
Inkling exports support PNG only. The remote font is loaded into memory for
rasterization, then discarded from the output; the PNG keeps a visible credit.
No downloadable Inkling SVG is produced. Format guards run both before rendering
and before download, including after a language switch. A font download failure
aborts the export rather than silently using the wrong appearance.

## Regression coverage

Dynamic sync, diagnostic and updater messages (including server-returned errors)
are part of the catalog, as are tooltip `title`, `aria-label` and placeholder
strings. Translation results use a bounded cache which is cleared when protected
player names change. Periodic status rendering preserves unchanged text nodes.
SVG attributes must have explicit values: HTML-style boolean attributes are not
valid XML and break the localized export parser. Verify actual PNG rasterization
as well as source-string coverage when changing charts or translation.
