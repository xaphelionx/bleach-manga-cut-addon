# Bleach Manga Cut CB1 POC

This is a deliberately one-episode Stremio addon for testing **Concentrated Bleach 01 — Death and Strawberry** against Nuvio 0.8.4-beta and Nuvio's existing native TorBox integration. It is not a full catalog, is not deployed, and is not yet verified playable.

Source status for this POC:

- **Confirmed:** the CB1 editorial metadata below; torrent `infoHash`, `fileIdx`, filename, video size, and absence of torrent trackers; Stremio catalog/meta/stream structure.
- **Provisional:** the locked manifest/catalog/video identifiers, display formatting, `bingeGroup`, and the Stremio runtime presentation of `"18"`.
- **Experiment:** TorBox cache availability, Nuvio playback, seeking/resume, and Continue Watching.
- **Unresolved:** a publicly reachable CB1 torrent swarm/source if TorBox does not already cache the hash, artwork, subtitles, full-series ordering/model, and every episode after CB1.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

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

The evidence torrent itself is not committed. Public swarm availability and TorBox cache availability are not verified. The current torrent has no tracker sources. A hash-only torrent is sufficient structurally for Stremio/Nuvio. Nuvio's native TorBox path must still be tested for cache availability. If TorBox reports **Not Cached**, do not solve that by adding arbitrary trackers. That becomes a source/distribution investigation before proceeding.

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

## Nuvio 0.8.4-beta test plan

Automated tests and valid local responses do not complete the compatibility POC. The human gate is:

1. Install this POC in Nuvio 0.8.4-beta.
2. Confirm Bleach Manga Cut appears.
3. Confirm only CB1 appears.
4. Confirm the P2P stream appears.
5. Select it using the user's normal native TorBox setup.
6. Record whether TorBox resolves it or reports **Not Cached**.
7. If resolved, verify correct file playback.
8. Verify seeking.
9. Verify resume.
10. Verify Continue Watching.
