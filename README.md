# Bleach Manga Cut CB1 POC

This is a deliberately one-episode Stremio addon that has completed real-device compatibility validation for **Concentrated Bleach 01 — Death and Strawberry** against Nuvio 0.8.4-beta and Nuvio's existing native TorBox integration. It is a validated compatibility checkpoint, not a full catalog, and is not deployed.

Source status for this POC:

- **Validated:** CB1 catalog, meta, torrent stream discovery, native TorBox resolution and playback, Nuvio AUTO player selection, original-audio and subtitle selection, seeking, resume, Continue Watching, and natural completion behavior.
- **Locked:** the stable identifiers, torrent identity, verified stream presentation, anime classification, Japanese original-language metadata, and runtime behavior documented below.
- **Out of scope:** CB2, a full-catalog import, deployment, and changes to the established addon architecture.
- **Still unresolved outside this POC:** public swarm availability independent of the validated TorBox-cached path, artwork, and the full-series ordering/import model.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

## Editorial evidence layers

The source-normalization workspace separates lossless extracted evidence from selected normalized evidence:

- `editorial/extracted/*` is the lossless audit layer. It may retain every substantive/non-empty source cell, including helper, statistical, and formula cells, so the committed extraction remains faithful to the five authoritative source files. Formatting-only and empty cells are excluded. Extracted evidence may remain unreferenced downstream; that is not an error.
- `editorial/normalized/*`, `editorial/variants/*`, `editorial/watch-orders/*`, and `editorial/unresolved.json` contain selected editorial interpretations. A helper, statistical, or formula cell may influence one of these outputs only when that output explicitly cites the cell's `evidenceId` through `fieldEvidence` or `evidenceRefs`.

Downstream reference state is deterministically derivable rather than stored as a mutable flag: an extracted evidence record is selected when its exact `evidenceId` appears in a downstream `fieldEvidence` or `evidenceRefs` collection. The editorial validator requires every such downstream reference to resolve to extracted evidence. The absence of a downstream reference means only that the evidence remains available in the lossless audit layer; it does not invalidate the extraction.

## Validated compatibility baseline

The compatibility baseline is **Nuvio 0.8.4-beta with native TorBox**, using the user's normal unchanged Nuvio and TorBox configuration. Real-device validation completed this full path:

```text
catalog -> meta -> stream -> TorBox -> playback -> seek/resume -> Continue Watching -> completion
```

The validated behavior is:

- Bleach Manga Cut loads in the catalog and Death and Strawberry loads as CB1.
- The TorBox-cached torrent stream is visible, resolves through Nuvio's native TorBox integration, and plays.
- Nuvio AUTO selects libmpv.
- Original Audio selects the Japanese AAC track.
- The user's existing subtitle preference selects the English Full Subtitles track.
- Seeking works, progress persists, and reopening the episode resumes correctly.
- Continue Watching displays CB1 and opens it at the saved position.
- Natural completion marks CB1 watched and removes it from Continue Watching.

## Locked CB1 compatibility contract

The following fields produced the validated behavior and are locked. Changing any of them requires a separate controlled experiment and complete baseline retesting.

- Stable IDs: series `bleach-manga-cut`; video `cb_1`.
- Torrent identity: `infoHash` `d0cb7e0c8bad014c055bf2becf2694dcfde2b8e8`; `fileIdx` `0`; `sources` `[]`.
- `behaviorHints`: `filename` `01 - Death and Strawberry.mkv`; `videoSize` `186522416`; `bingeGroup` `bleach-manga-cut|p2p|standard`.
- Verified technical stream presentation: name `[P2P🧲] 576p`; title identifies Death and Strawberry, `[001]`, `18:15`, `186.52 MB`, `HEVC`, `AAC 2.0`, and `JPN + ENG`.
- Series classification: `genres` contains both `Animation` and `Anime` in the catalog preview and full meta response.
- Original-language metadata: full meta `language` is `Japanese`.
- Existing episode structure and runtime behavior: season `1`, episode `1`, and Stremio runtime `"18"` remain unchanged.

Verified local inspection evidence records 768x576 HEVC/H.265 Main video with `yuv420p`, Japanese and English AAC LC stereo/2.0 audio, and the embedded subtitle tracks. Embedded subtitles remain media tracks and are not converted into Stremio external subtitle URLs.

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

## Torrent evidence

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
```

## Regression gate

Automated tests protect the deterministic addon responses and locked fields. Any future intentionally authorized compatibility change must also repeat the complete real-device baseline: catalog and meta loading, stream discovery, native TorBox playback, libmpv AUTO selection, Japanese original audio, English Full Subtitles selection, seeking, resume, Continue Watching, and natural completion removal.
