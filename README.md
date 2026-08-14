# Bleach Manga Cut Two-Episode POC

This is a deliberately two-episode Stremio addon that has completed user-confirmed real-device compatibility validation for **Concentrated Bleach 01 — Death and Strawberry** and **Concentrated Bleach 02 — Starter** against Nuvio 0.8.4-beta and Nuvio's existing native TorBox integration. It is a validated compatibility checkpoint, not a full catalog, and is not deployed.

Source status for this POC:

- **Validated:** exact CB1/CB2 catalog and meta ordering; CB1 regression playback; CB2 native TorBox resolution and playback; Nuvio AUTO player selection; original-audio and subtitle selection; seeking, resume, Continue Watching, and CB1-to-CB2 next-episode behavior.
- **Locked:** the stable identifiers, torrent identity, verified stream presentation, anime classification, Japanese original-language metadata, and runtime behavior documented below.
- **Out of scope:** CB3 and later episodes, a full-catalog import, deployment, and changes to the established addon architecture.
- **Still unresolved outside this POC:** public swarm availability independent of the validated native TorBox paths, artwork, the full-series ordering/import model, and exact Nuvio stream-presentation UI parity.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

## Editorial evidence layers

The source-normalization workspace separates lossless extracted evidence from selected normalized evidence:

- `editorial/extracted/*` is the lossless audit layer. It may retain every substantive/non-empty source cell, including helper, statistical, and formula cells, so the committed extraction remains faithful to the five authoritative source files. Formatting-only and empty cells are excluded. Extracted evidence may remain unreferenced downstream; that is not an error.
- `editorial/normalized/*`, `editorial/variants/*`, `editorial/watch-orders/*`, and `editorial/unresolved.json` contain selected editorial interpretations. A helper, statistical, or formula cell may influence one of these outputs only when that output explicitly cites the cell's `evidenceId` through `fieldEvidence` or `evidenceRefs`.

Downstream reference state is deterministically derivable rather than stored as a mutable flag: an extracted evidence record is selected when its exact `evidenceId` appears in a downstream `fieldEvidence` or `evidenceRefs` collection. The editorial validator requires every such downstream reference to resolve to extracted evidence. The absence of a downstream reference means only that the evidence remains available in the lossless audit layer; it does not invalidate the extraction.

## Manual experiment / user-confirmed Nuvio validation

The compatibility baseline is **Nuvio 0.8.4-beta with native TorBox**, using the user's normal unchanged Nuvio and TorBox configuration previously validated with CB1. These results are a manual experiment confirmed by the user; they are not automatically reproducible unit-test facts and are separate from repository/static validation and verified-media technical evidence.

Real-device validation completed this two-episode path:

```text
catalog -> meta -> stream -> TorBox -> playback -> seek/resume -> Continue Watching -> completion -> next episode
```

The validated behavior is:

- Bleach Manga Cut shows exactly CB1 as S1E1, Death and Strawberry, followed by CB2 as S1E2, Starter.
- CB1 still exposes its stream and resolves and plays as before.
- CB2 resolves through Nuvio's native TorBox integration and plays successfully.
- Nuvio AUTO selects libmpv normally for CB2.
- Original Audio selects the Japanese track, and the intended English Full Subtitles track is selected.
- CB2 seeking and resume work, and CB2 appears appropriately in Continue Watching.
- Natural completion of CB1 identifies Starter as the next episode; navigation/autoplay into CB2 succeeds, after which CB2 resolves and plays.
- Nuvio's current UI does not visibly expose the literal raw stream name `[P2P🧲] 576p`. This is not considered a compatibility failure because the correct CB2 torrent resolves and plays; exact presentation formatting remains a possible later UI/parity audit.

## Locked two-episode compatibility contract

The following fields produced the validated behavior and are locked. Changing any of them requires a separate controlled experiment and complete baseline retesting.

- Stable IDs: series `bleach-manga-cut`; videos `cb_1` and `cb_2`.
- Torrent identity: `infoHash` `d0cb7e0c8bad014c055bf2becf2694dcfde2b8e8`; `fileIdx` `0`; `sources` `[]`.
- `behaviorHints`: `filename` `01 - Death and Strawberry.mkv`; `videoSize` `186522416`; `bingeGroup` `bleach-manga-cut|p2p|standard`.
- Verified technical stream presentation: name `[P2P🧲] 576p`; title identifies Death and Strawberry, `[001]`, `18:15`, `186.52 MB`, `HEVC`, `AAC 2.0`, and `JPN + ENG`.
- Series classification: `genres` contains both `Animation` and `Anime` in the catalog preview and full meta response.
- Original-language metadata: full meta `language` is `Japanese`.
- Episode structure and runtime behavior: CB1 remains S1E1 with Stremio runtime `"18"`; CB2 remains S1E2 with Stremio runtime `"32"`.

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
```

## Regression gate

Automated tests protect the deterministic addon responses and locked fields; they do not reproduce the manual Nuvio/TorBox experiment. Any future intentionally authorized compatibility change must also repeat the complete real-device baseline: exact catalog/meta ordering, stream discovery, native TorBox playback, libmpv AUTO selection, Japanese original audio, English Full Subtitles selection, seeking, resume, Continue Watching, natural completion, and next-episode navigation.
