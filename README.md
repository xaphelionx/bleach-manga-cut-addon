# Bleach Manga Cut Preboundary Publication Checkpoint

This Stremio addon publishes the complete safe 36-entry Concentrated Bleach prefix from CB1 through CB35, including CB27.5. Only **Concentrated Bleach 01 — Death and Strawberry**, **Concentrated Bleach 02 — Starter**, and **Concentrated Bleach 03 — The Pink-Cheeked Cockatiel** have completed the locked, user-confirmed real-device compatibility path against Nuvio 0.8.4-beta and Nuvio's existing native TorBox integration. CB4–CB35 are published for representative compatibility sampling and remain unlocked. This is not a full catalog and is not deployed.

Current publication and validation state:

- **Published:** 36 preboundary Concentrated entries: CB1–CB35, including CB27.5.
- **Real-device validated and locked:** CB1, CB2, and CB3, including native TorBox resolution/playback, Nuvio AUTO behavior, original-audio and subtitle selection, seeking, resume, Continue Watching, completion, and next-episode behavior.
- **Published but unlocked:** CB4–CB35. Before publication, the user confirmed all 33 exact deterministic torrent artifacts were loaded/seeding against their verified payloads, added to TorBox, and cached/available there. These entries still await representative Nuvio compatibility sampling.
- **Hard stop:** CB35 is the last safely published record before the unresolved Watch Guide endpoint 35.5. CB36 and later remain blocked pending resolution of `concentrated-35.5-vs-0.0`.
- **Out of scope:** resolving 35.5, publishing CB36 or later, a full-catalog import, deployment, and changes to the established addon architecture.
- **Still unresolved:** permanent public swarm availability, availability after all seeds disappear, arbitrary third-party discovery, future cache persistence, artwork, and exact Nuvio stream-presentation UI parity.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

## Editorial evidence layers

The source-normalization workspace separates lossless extracted evidence from selected normalized evidence:

- `editorial/extracted/*` is the lossless audit layer. It may retain every substantive/non-empty source cell, including helper, statistical, and formula cells, so the committed extraction remains faithful to the five authoritative source files. Formatting-only and empty cells are excluded. Extracted evidence may remain unreferenced downstream; that is not an error.
- `editorial/normalized/*`, `editorial/variants/*`, `editorial/watch-orders/*`, and `editorial/unresolved.json` contain selected editorial interpretations. A helper, statistical, or formula cell may influence one of these outputs only when that output explicitly cites the cell's `evidenceId` through `fieldEvidence` or `evidenceRefs`.

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

## Preboundary availability checkpoint

On 2026-08-16, before the 33-entry publication expansion, the user confirmed that every remaining exact deterministic preboundary torrent for CB4–CB35, including CB27.5, was loaded and seeding against its verified payload, added to TorBox, and successfully cached/available in the user's environment. No TorBox identifier, account data, private URL, or credential is recorded here.

That operational precondition supports controlled publication for compatibility sampling. It does not establish permanent public swarm availability, availability with all seeds offline, arbitrary third-party discovery, future TorBox cache persistence, or successful Nuvio playback for all 33 newly published entries. Those entries therefore remain `locked:false`; only representative real-device testing can advance their compatibility status.

The publication boundary remains exact: CB35 is S2E27 and the final resolved default-timeline entry before the unresolved 35.5 endpoint. CB36 is projected as S3E1 but has an unresolved default-timeline position and remains unpublished. The 35.5 endpoint is not treated as Concentrated 0.0.

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

Automated tests protect the 36-entry deterministic publication output and the locked CB1–CB3 fields; they do not reproduce either the user-confirmed TorBox cache precondition or the manual Nuvio/TorBox playback experiment. Compatibility locking for the published-but-unlocked CB4–CB35 batch requires representative real-device sampling of stream discovery, native TorBox playback, libmpv AUTO selection, Japanese original audio, embedded subtitles, seeking, resume, Continue Watching, completion, and next-episode navigation.
