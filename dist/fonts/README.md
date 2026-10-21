# Player nameplate fonts

The optional Inkling display mode uses a separate remotely loaded font by
eli / frozenpandaman. See [INKLING-NOTICE.txt](INKLING-NOTICE.txt) for attribution,
non-commercial conditions, pinned source and network behavior. This is not the
Splatfont used for player nameplates. Neither remote font is bundled.

`MPLUSRounded1c-ExtraBold.ttf` is the unmodified M PLUS Rounded 1c ExtraBold
font from Google Fonts (`ofl/mplusrounded1c`), blob
`87139264ea06b57d45426775bc915622eae03272`. Copyright 2016 The Rounded M+
Project Authors. It is distributed under SIL Open Font License 1.1; see
`OFL.txt`. It supplies a local rounded fallback, including Japanese glyphs.

Only player names optionally request Splatfont from the same community-hosted
`Splatoon1.otf` source used by Conch Bay. The CDN URL in `style.css` is pinned
to revision `56c20268db71a96e563cbc286e899d78262abce6` of
`frozenpandaman/frozenpandaman.github.io`. That font is not bundled and is not
covered by this project's license. The browser requests it on first displaying
a player nameplate, with no referrer. If unavailable, the bundled font and
system glyph fallbacks remain usable. No game records or credentials are sent.

Nameplate layout measurements were informed by Conch Bay's `Splashtag.tsx`
(MIT, https://github.com/zhxie/conch-bay). Salmon Review's HTML/CSS and sizing
logic are independently implemented.
