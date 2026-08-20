# Bleach Manga Cut preboundary compatibility baseline

This Stremio addon publishes the current 37-entry Concentrated Bleach prefix from CB1 through guided CB35.5, including CB27.5. All 37 entries are compatibility-locked as the accepted batch baseline after deterministic technical validation, representative real-device sampling, and the complete CB35→CB35.5 terminal test against Nuvio 0.8.4-beta with its native TorBox integration. **Concentrated Bleach 01 — Death and Strawberry**, **Concentrated Bleach 02 — Starter**, and **Concentrated Bleach 03 — The Pink-Cheeked Cockatiel** retain their stronger individually established historical fixtures. The batch lock does not imply that every episode was manually played or that every client UI behavior is bug-free. This is not a full catalog and is not deployed.

Current publication and validation state:

- **Published:** 37 Concentrated entries: CB1–guided CB35.5, including CB27.5. Guided CB35.5 is spreadsheet record `concentrated:0.0`, internal ID `cb_0p0`, and the final Season 2 episode at S2E28.
- **Compatibility-locked batch:** all 37 published IDs, from `cb_1` through `cb_35` including `cb_27p5`, followed by guided CB35.5 / `cb_0p0`, are `published` and `locked:true`.
- **Directly established historical fixtures:** CB1, CB2, and CB3 retain their individually validated native-TorBox playback and permanent stream/provenance fixtures.
- **Representative batch validation:** CB4–CB35 are locked from deterministic evidence plus the documented representative sample; this is not a claim that every entry was individually playback-tested.
- **Fully tested terminal entry:** guided CB35.5 is spreadsheet record `concentrated:0.0` (`the rotator / the sand`), permanent ID `cb_0p0`, and S2E28. Its corrected terminal compatibility path was completed on 2026-08-20.
- **Technical and availability precondition:** the exact deterministic trackerless torrent verified 51/51 pieces. The project owner confirmed it at 100% and seeding, confirmed info hash `cbdfdf3949a8f8c2d470dfc4f1d1a21571dca7bc`, and confirmed that exact torrent was acquired/cached in the user's TorBox environment. No private TorBox details are recorded.
- **Accepted client limitation:** the Details-screen focus trap reproduced after CB35.5 natural completion. Backing out to Nuvio Home and re-entering Bleach Details restores normal navigation. The limitation is non-blocking and its attribution remains unresolved.
- **Canonical prefix stop:** CB36+ remain unpublished; CB36 is now the first unpublished canonical suffix entry.
- **Arrancar technical acquisition:** CB36–CB51 now have separate verified local acquisition and media evidence. All 16 trackerless torrents were independently recreated byte-for-byte and verified across all 4,771 pieces. The torrent files remain only in the ignored local workspace; CB36–CB51 remain `reserved`, `locked:false`, and unpublished.
- **Arrancar availability/testing still pending:** the project owner has not yet performed user-side seeding or TorBox acquisition for this batch, and no CB36–CB51 Nuvio playback test has occurred. No permanent public availability claim is made.
- **Out of scope:** publishing CB36 or later, TorBox access, a full-catalog import, deployment, and changes beyond the accepted preboundary baseline.
- **Still unresolved:** permanent public swarm availability, availability after all seeds disappear, arbitrary third-party discovery, future cache persistence, artwork, and exact Nuvio stream-presentation UI parity.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

## Editorial evidence layers

The source-normalization workspace separates lossless extracted evidence from selected normalized evidence:

- `editorial/extracted/*` is the lossless audit layer. It may retain every substantive/non-empty source cell, including helper, statistical, and formula cells, so the committed extraction remains faithful to the five authoritative source files. Formatting-only and empty cells are excluded. Extracted evidence may remain unreferenced downstream; that is not an error.
- `editorial/normalized/*`, `editorial/variants/*`, `editorial/watch-orders/*`, and `editorial/unresolved.json` contain selected editorial interpretations. A helper, statistical, or formula cell may influence one of these outputs only when that output explicitly cites the cell's `evidenceId` through `fieldEvidence` or `evidenceRefs`.
- `editorial/resolutions.json` is a separately maintained project-owner decision artifact. It keeps the direct Watch Guide claim (`35.5`), the direct spreadsheet claim (`concentrated:0.0` / `0.0`), and the owner-resolved relationship distinct.

Downstream reference state is deterministically derivable rather than stored as a mutable flag: an extracted evidence record is selected when its exact `evidenceId` appears in a downstream `fieldEvidence` or `evidenceRefs` collection. The editorial validator requires every such downstream reference to resolve to extracted evidence. The absence of a downstream reference means only that the evidence remains available in the lossless audit layer; it does not invalidate the extraction.

## Manual experiment / user-confirmed Nuvio validation

The compatibility baseline is **Nuvio 0.8.4-beta with native TorBox**, using the user's normal existing configuration. These results were manually confirmed by the user on **2026-08-16**; they are not automatically reproducible unit-test facts and are separate from repository/static validation and verified-media technical evidence.

Real-device validation completed this three-episode path:

```text
catalog -> meta -> stream -> TorBox -> playback -> seek/resume -> Continue Watching -> completion -> next episode
```

The validated sequence is:

- CB1 — S1E1 — Death and Strawberry
- CB2 — S1E2 — Starter
- CB3 — S1E3 — The Pink-Cheeked Cockatiel

The user-confirmed behavior is:

- Bleach Manga Cut shows exactly CB1, CB2, and CB3 in the sequence above.
- CB1 still exposes its stream and resolves and plays as before.
- CB2 resolves through Nuvio's native TorBox integration and plays successfully.
- Nuvio AUTO selects libmpv normally for CB2.
- Original Audio selects the Japanese track, and the intended English Full Subtitles track is selected.
- CB2 seeking and resume work, and CB2 appears appropriately in Continue Watching.
- Natural completion of CB1 identifies Starter as the next episode; navigation/autoplay into CB2 succeeds, after which CB2 resolves and plays.
- CB3 is visible as S1E3, exposes its stream, and starts playback through native TorBox resolution.
- CB3 works with the expected libmpv/AUTO behavior, Japanese audio, embedded subtitle tracks, seeking, resume, Continue Watching, and completion behavior.
- CB2-to-CB3 next-episode/autoplay behavior succeeds. At the three-entry validation checkpoint, CB3 did not expose CB4 as a next published episode.
- Nuvio's current UI does not visibly expose the literal raw stream name `[P2P🧲] 576p`. This is not considered a compatibility failure because the correct CB2 torrent resolves and plays; exact presentation formatting remains a possible later UI/parity audit.

The CB3 experiment used the exact trackerless torrent identity `52094de720ccaa6d4eb3ce82eef8516f726cbf63`, file index `0`, and payload `03 - The Pink-Cheeked Cockatiel.mkv`. The torrent was seeded from the user's qBittorrent environment and was successfully acquired/cached by TorBox; Nuvio then resolved and played it through the native TorBox integration. This proves that exact locally seeded payload worked in the user's real environment. It does not prove permanent public swarm availability, availability while that seed is offline, arbitrary third-party peer discovery, or remote availability of every future generated torrent. Verified-media network evidence therefore remains unresolved.

Before testing, the TV temporarily lost access to the locally hosted addon because the host computer's LAN IP address had changed. Updating the installed manifest URL to the current reachable LAN IP restored access. This was a local-network operational issue, not an addon compatibility, TorBox, torrent, or Nuvio stream-contract failure.

Representative batch testing subsequently passed CB4 playback/progress, the CB9→CB10 season transition, CB27→CB27.5→CB28 ordering/playback, CB32 playback/subtitles, and CB35 playback. This sample establishes representative real-device coverage across the prefix; it does not mean every CB4–CB35 episode was individually played.

On **2026-08-20**, the project owner completed the corrected final-Season-2 test on the normal Nuvio 0.8.4-beta plus native TorBox configuration. The directly confirmed results were:

- CB35.5 visible as S2E28: **PASS**.
- CB35→CB35.5 navigation: **PASS**.
- CB35.5 playback through native TorBox: **PASS**.
- Japanese audio and embedded subtitles: **PASS**.
- Seek, resume, and Continue Watching: **PASS**.
- CB35.5 natural completion: **PASS**.
- CB35.5 correctly did not offer unpublished CB36: **PASS**.
- Details-screen focus after backing out of CB35: **PASS**.
- Details-screen focus after backing out of CB35.5: **PASS**.
- Details-screen focus after CB35.5 natural completion: **focus trap reproduced**.
- Other unexpected behavior: **none**.

The terminal-completion focus trap is accepted as a known non-blocking UI limitation, not as a fixed issue. Backing out returns to Nuvio Home with the Bleach addon still selected, and the user can immediately re-enter its Details page. Attribution remains unresolved: it is not classified as a proven generic Nuvio bug, Bleach-addon bug, TorBox issue, or torrent issue. An earlier same-environment One Pace Premium control did not reproduce the previously observed focus behavior, but a terminal One Pace Premium A/B control was unavailable because its final listed episode is unreleased and has no playable stream.

## Current publication and final Season 2 entry

On 2026-08-16, before the 33-entry publication expansion, the user confirmed that every remaining exact deterministic preboundary torrent for CB4–CB35, including CB27.5, was loaded and seeding against its verified payload, added to TorBox, and successfully cached/available in the user's environment. No TorBox identifier, account data, private URL, or credential is recorded here.

That operational precondition supported controlled publication and compatibility sampling. It does not establish permanent public swarm availability, availability with all seeds offline, arbitrary third-party discovery, or future TorBox cache persistence.

The source spreadsheet identity remains `concentrated:0.0`, displayed identifier `0.0`, title `the rotator / the sand`. The separate Watch Guide identity remains guided `35.5`. The project-owner resolution `editorial-resolution:concentrated-35.5-to-0.0` links those facts for the default watch order without rewriting either source. The record keeps permanent ID `cb_0p0`, is published and compatibility-locked as S2E28/global index 37. CB36 is S3E1/global index 38 and remains reserved, unlocked, and unpublished.

Inspection found the local 35.5 media suitable for this unambiguous mapping. Its exact deterministic trackerless torrent exists in the ignored local workspace, all 51 pieces verified against the payload, the acquisition manifest includes `cb_0p0`, and verified-media evidence exists at `evidence/media/cb_0p0.json`. The project owner confirmed the exact torrent is seeded and cached in the user's TorBox environment. Production meta, stream, and provenance include `cb_0p0`, with provenance retaining the owner-resolution reference. The 2026-08-20 real-device terminal test passed every functional CB35→CB35.5 requirement while reproducing the accepted focus limitation. No permanent public availability claim has been made.

## Batch compatibility-lock meaning

For the current 37-entry prefix, `locked:true` means the addon-facing identity, order, torrent, and stream compatibility contract is accepted as the stable baseline; future changes require deliberate revalidation. The lock is supported by deterministic editorial/projection derivation, verified-media evidence, exact deterministic torrents and piece verification, the user-side seed/cache precondition, representative real-device sampling, season-boundary and decimal-insertion tests, the subtitle sample, and the complete CB35→CB35.5 terminal sequence.

The batch lock does **not** mean every episode was manually played, every Nuvio UI behavior is bug-free, the terminal-completion focus trap is resolved, permanent public swarm availability is proven, or future TorBox cache persistence is guaranteed. CB1–CB3 retain their stronger individually established historical fixtures; the remainder is an explicitly documented batch validation.

## Arrancar technical-acquisition state

The default Concentrated Arrancar span CB36–CB51 now has a separate deterministic technical-acquisition artifact at `evidence/acquisition/concentrated-arrancar.json` and verified-media evidence at `evidence/media/cb_36.json` through `evidence/media/cb_51.json`. Each exact single-file BitTorrent v1 artifact was created without trackers or web seeds, independently recreated to confirm byte determinism, and verified piece-by-piece against its unchanged local payload. The 16 torrents total 4,771 verified pieces with zero mismatches.

This technical evidence does not advance publication. The current public and compatibility-locked prefix remains exactly 37 entries through guided CB35.5 / `cb_0p0`; CB36–CB51 remain reserved, unlocked, and absent from production meta, streams, and provenance. The torrent artifacts live only under the ignored local `sources/torrents/concentrated-arrancar/` workspace. User-side seeding and TorBox acquisition have not yet been performed for this batch, Nuvio playback has not been tested, and no permanent availability claim is made.

The Watch Guide's optional CB50 instruction remains separate from the default timeline: pause CB50 at 16:15, play Hollowed 11.5, then resume CB50. This checkpoint does not create Hollowed 11.5 evidence or add it to the primary series.

## Locked CB1–CB3 compatibility contract

The following fields produced the validated behavior and are locked. Changing any of them requires a separate controlled experiment and complete baseline retesting.

- Stable IDs: series `bleach-manga-cut`; videos `cb_1`, `cb_2`, and `cb_3`.
- CB1 torrent identity: `infoHash` `d0cb7e0c8bad014c055bf2becf2694dcfde2b8e8`; `fileIdx` `0`; `sources` `[]`.
- CB1 `behaviorHints`: `filename` `01 - Death and Strawberry.mkv`; `videoSize` `186522416`; `bingeGroup` `bleach-manga-cut|p2p|standard`.
- CB3 torrent identity: `infoHash` `52094de720ccaa6d4eb3ce82eef8516f726cbf63`; `fileIdx` `0`; `sources` `[]`.
- CB3 `behaviorHints`: `filename` `03 - The Pink-Cheeked Cockatiel.mkv`; `videoSize` `348128661`; `bingeGroup` `bleach-manga-cut|p2p|standard`.
- Verified technical stream presentation: name `[P2P🧲] 576p`; title identifies Death and Strawberry, `[001]`, `18:15`, `186.52 MB`, `HEVC`, `AAC 2.0`, and `JPN + ENG`.
- Series classification: `genres` contains both `Animation` and `Anime` in the catalog preview and full meta response.
- Original-language metadata: full meta `language` is `Japanese`.
- Episode structure and runtime behavior: CB1 remains S1E1 with Stremio runtime `"18"`; CB2 remains S1E2 with Stremio runtime `"32"`; CB3 remains S1E3 with Stremio runtime `"36"`.

Detailed per-episode torrent and local-media facts remain in `evidence/media` and generated provenance. Embedded subtitles remain media tracks and are not converted into Stremio external subtitle URLs.

## Security and integration boundary

The addon exposes torrent identity metadata and relies on Nuvio's native TorBox integration for resolution. No TorBox API key, private TorBox URL, resolved playback URL, token, UUID, or private manifest URL belongs in this repository or in addon responses. Those values must not be added to fixtures, provenance, documentation, tests, or source code. The loopback manifest shown below is only a local development endpoint.

## Authoritative CB1 source and provenance

The authoritative editorial source is `!Concentrated Bleach Info.xlsx`, sheet `Episode List`, row 2, cells `A2:H2`:

- Edit: Concentrated Bleach
- Episode: 1
- Title: Death and Strawberry
- Manga chapters: 001
- Source anime episodes: 001
- Exact edit runtime: 00:18:15
- Time saved: 04m35s (20%)
- Release date: 2024-04-11
- Last update: 2026-06-23

Provenance retains the source value `00:18:15` and its normalized exact value `18:15`. The Stremio video runtime is presented as `"18"` minutes for this POC, matching the observed One Pace convention; this is a presentation transformation, not a replacement of the exact source value. No `firstAired` timestamp is supplied.

## CB1 torrent evidence

Verified values extracted from `01 - Death and Strawberry.mkv.torrent`:

- `infoHash`: `d0cb7e0c8bad014c055bf2becf2694dcfde2b8e8`
- `fileIdx`: `0`
- Filename: `01 - Death and Strawberry.mkv`
- Video size: `186522416` bytes
- Torrent file count: `1`
- Announce tracker, announce list, and web seed: absent

The evidence torrent itself is not committed. The hash is cached and playable through native TorBox in the validated baseline; public swarm availability independent of that path remains unverified. The current torrent has no tracker sources, and no arbitrary trackers should be added. Any future source/distribution work is separate from this locked compatibility checkpoint.

## Local install and run

```sh
npm install
npm test
npm start
```

The local manifest is served at `http://127.0.0.1:7000/manifest.json`.

```sh
curl http://127.0.0.1:7000/manifest.json
curl http://127.0.0.1:7000/catalog/series/bleach-manga-cut.json
curl http://127.0.0.1:7000/meta/series/bleach-manga-cut.json
curl http://127.0.0.1:7000/stream/series/cb_1.json
curl http://127.0.0.1:7000/stream/series/cb_2.json
curl http://127.0.0.1:7000/stream/series/cb_3.json
```

`127.0.0.1` and `localhost` always refer to the device making the request. A TV must use a manifest URL it can reach, normally using the host computer's LAN IP address. DHCP changes or reboots may change that address and require updating the installed manifest URL; the repository must not record the private LAN IP itself.

## Regression gate

Automated tests protect the 37-entry deterministic publication output, require that exact published prefix to equal the explicit 37-ID compatibility-locked baseline, preserve the permanent CB1–CB3 fixtures, and keep every reserved ID unlocked. They do not reproduce the user-confirmed TorBox cache precondition or the manual Nuvio/TorBox experiments. The 2026-08-20 manual record supplies the corrected CB35→CB35.5 terminal validation and preserves the accepted focus-trap limitation; CB36+ remain unpublished.
