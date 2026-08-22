# Bleach Manga Cut compatibility baseline

This Stremio addon publishes and compatibility-locks the current 91-entry default prefix: 53 Concentrated Bleach entries from CB1 through CB51, including CB27.5 and guided CB35.5, followed by the complete 38-entry owner-selected Hollowed current-raw span from HB14 through HB50 with HB0.8 in its established position. The first 37 entries retain their prior preboundary validation history; CB36–CB51 retain the documented representative Arrancar validation; HB14 retains its complete proof; and the remaining 37 Hollowed entries are now locked from the representative real-device batch validation recorded below. **Concentrated Bleach 01 — Death and Strawberry**, **Concentrated Bleach 02 — Starter**, and **Concentrated Bleach 03 — The Pink-Cheeked Cockatiel** retain their stronger individually established historical fixtures. The Hollowed batch decision is not a claim that every episode was played end-to-end or that permanent availability is proven. This is not a full catalog and is not deployed.

Current publication and validation state:

- **Published:** exactly 91 default entries: 53 Concentrated entries through `cb_51`, followed by all 38 owner-selected current-raw Hollowed entries through `hb_50`. Guided CB35.5 is spreadsheet record `concentrated:0.0`, internal ID `cb_0p0`, and the final Season 2 episode at S2E28; CB36–CB51 occupy S3E1–S3E16; Hollowed occupies S3E17–S3E54.
- **Compatibility-locked prefix:** all 91 published IDs through `hb_50` are now `locked:true`. The final 37 locks record a separate representative validation decision; publication itself did not grant those locks.
- **Directly established historical fixtures:** CB1, CB2, and CB3 retain their individually validated native-TorBox playback and permanent stream/provenance fixtures.
- **Representative batch validation:** CB4–CB35 are locked from deterministic evidence plus the documented representative sample; this is not a claim that every entry was individually playback-tested.
- **Fully tested terminal entry:** guided CB35.5 is spreadsheet record `concentrated:0.0` (`the rotator / the sand`), permanent ID `cb_0p0`, and S2E28. Its corrected terminal compatibility path was completed on 2026-08-20.
- **Technical and availability precondition:** the exact deterministic trackerless torrent verified 51/51 pieces. The project owner confirmed it at 100% and seeding, confirmed info hash `cbdfdf3949a8f8c2d470dfc4f1d1a21571dca7bc`, and confirmed that exact torrent was acquired/cached in the user's TorBox environment. No private TorBox details are recorded.
- **Accepted client limitation:** the Details-screen focus trap reproduced after CB35.5 natural completion. Backing out to Nuvio Home and re-entering Bleach Details restores normal navigation. The limitation is non-blocking and its attribution remains unresolved.
- **Canonical prefix stop:** Chipped #01 (`ch_1`, `The Lost Agent`) is the first unpublished default entry at S4E1/global index 92. Concentrated CB52+ and Hollowed 51–62 are reserved source identities, not the next selected default Watch Guide entries.
- **Arrancar validation:** CB36–CB51 have separate verified local acquisition and media evidence. All 16 trackerless torrents were independently recreated byte-for-byte and verified across all 4,771 pieces. The project owner confirmed the exact 16 torrents are seeded and acquired/cached in the user's TorBox environment, then completed representative beginning/middle/end real-device validation. CB36–CB51 are now compatibility-locked as a batch; this is not a claim that all 16 were individually played end-to-end.
- **Arrancar direct sample:** CB35.5→CB36, the full CB36 compatibility sample, the CB43 middle-batch sample, CB50→CB51, CB51 playback/natural completion, and the correct absence of HB14 and CB52 all passed.
- **Hollowed technical evidence and validation:** the owner-selected 38-entry current raw membership has a separate deterministic acquisition manifest and 38 verified-media records. All 38 local trackerless torrents were independently reproduced byte-for-byte and all 33,764 pieces verified against the selected MP4 payloads. The project owner separately confirmed 38/38 are 100% and seeding in qBittorrent and 38/38 are Download Ready in TorBox. All 38 are published and compatibility-locked; HB15, the HB29→HB0.8→HB30 insertion, HB34, corrected HB36, and terminal HB50 provided representative real-device coverage beyond the complete HB14 proof.
- **Out of scope:** publishing Chipped, publishing Hollowed 11.5, 51–62, or optional/EX content, publishing Concentrated CB52+, future-v3 adoption, TorBox access by this project, deployment, and changes beyond this validation checkpoint.
- **Still unresolved:** permanent public swarm availability, availability after all seeds disappear, arbitrary third-party discovery, future cache persistence, artwork, exact Nuvio stream-presentation UI parity, the accepted terminal focus trap, intermittent persistent audio after playback exit, and the self-resolved playback-availability anomaly described below.

## Architecture

Deterministic wire-shaped content lives in `data/catalog`, `data/meta`, and `data/stream`, with evidence in `data/provenance`. `src/addon.js` is a thin `stremio-addon-sdk` adapter that loads those JSON files and defines the catalog, meta, and stream handlers. Unknown IDs return empty protocol responses.

## Editorial evidence layers

The source-normalization workspace separates lossless extracted evidence from selected normalized evidence:

- `editorial/extracted/*` is the lossless audit layer. It may retain every substantive/non-empty source cell, including helper, statistical, and formula cells, so the committed extraction remains faithful to the five authoritative source files. Formatting-only and empty cells are excluded. Extracted evidence may remain unreferenced downstream; that is not an error.
- `editorial/normalized/*`, `editorial/variants/*`, `editorial/watch-orders/*`, and `editorial/unresolved.json` contain selected editorial interpretations. A helper, statistical, or formula cell may influence one of these outputs only when that output explicitly cites the cell's `evidenceId` through `fieldEvidence` or `evidenceRefs`.
- `editorial/resolutions.json` is a separately maintained project-owner decision artifact. It keeps the direct Watch Guide claim (`35.5`), the direct spreadsheet claim (`concentrated:0.0` / `0.0`), and the owner-resolved relationship distinct. It also records the current-version Hollowed membership decision without rewriting the spreadsheet's unresolved v3 claims.

Downstream reference state is deterministically derivable rather than stored as a mutable flag: an extracted evidence record is selected when its exact `evidenceId` appears in a downstream `fieldEvidence` or `evidenceRefs` collection. The editorial validator requires every such downstream reference to resolve to extracted evidence. The absence of a downstream reference means only that the evidence remains available in the lossless audit layer; it does not invalidate the extraction.

## Current Hollowed membership decision

On 2026-08-21, the project owner explicitly selected the existing raw-record membership for the current default Hollowed path: Hollowed 14–29, Hollowed 0.8, then Hollowed 30–50, for 38 records in source order. This resolves current acquisition planning without merging, aliasing, obsoleting, rekeying, or renumbering the raw records described by the unfinished v3 combination/rework notes.

The spreadsheet v3 notes remain preserved as unresolved source claims. Usable v3 media and a sufficiently authoritative mapping are not currently available to this project, so future v3 adoption is not automatic and requires a fresh audit plus an explicit owner-reviewed migration decision. The 38 ignored local MP4s are acquisition payloads, not authoritative editorial sources. Their deterministic trackerless torrents now exist only in the ignored local workspace, were independently reproduced byte-for-byte, and verified across all 33,764 pieces. The committed `evidence/acquisition/hollowed-current-raw.json` manifest and 38 `evidence/media/hb_*.json` records preserve the observed AAC audio with raw/container tag `eng` and zero embedded subtitle tracks; `(sub)` in a filename is not subtitle-stream evidence.

HB34 and HB36 retain their fresh measured container durations as technical provenance despite material differences from normalized editorial runtime. Editorial runtime remains authoritative for Stremio presentation. The project owner confirmed the 38/38 qBittorrent seeding and TorBox Download Ready availability gate without exposing private integration material. All 38 selected Hollowed entries are published and compatibility-locked through the ordinary runtime path at S3E17–S3E54/global indexes 54–91 after the representative validation recorded below. No permanent public availability or exhaustive episode-by-episode playback result is claimed.

## Manual experiment / user-confirmed Nuvio validation

The compatibility baseline is **Nuvio 0.8.4-beta with native TorBox**, using the user's normal existing configuration. The initial results were manually confirmed by the user on **2026-08-16**, followed by the dated checkpoints below; they are not automatically reproducible unit-test facts and are separate from repository/static validation and verified-media technical evidence.

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

Also on **2026-08-20**, the project owner completed representative Arrancar validation on the normal Nuvio 0.8.4-beta plus native TorBox configuration. The directly confirmed results were:

- CB35.5→CB36 season transition: **PASS**.
- CB36 native-TorBox playback, Japanese audio, embedded subtitles, seek, resume, and Continue Watching: **PASS**.
- CB43 native-TorBox playback, Japanese audio/subtitles, and seek: **PASS**.
- CB50→CB51: **PASS**.
- CB51 native-TorBox playback and natural completion: **PASS**.
- HB14 correctly absent after CB51: **PASS**.
- CB52 correctly absent after CB51: **PASS**.
- Details-screen focus after CB51 natural completion: **focus trap reproduced**.
- Other unexpected behavior: **none**.

The owner did not manually play all 16 Arrancar entries end-to-end. The CB36–CB51 lock is a representative batch decision supported by the normalized editorial/projection model, deterministic verified-media evidence, independent torrent recreation, 4,771/4,771 piece verification, 16/16 user-side seeding and cache confirmation, and beginning/middle/end real-device coverage.

The repeated post-completion focus observation is recorded as a known, non-blocking client/UI limitation with unresolved attribution, not as a fixed issue or a proven Nuvio, Bleach-addon, TorBox, or torrent defect. The workaround remains: back out to Nuvio Home, where Bleach remains selected, then re-enter Bleach Details to restore normal navigation.

On **2026-08-22**, the project owner completed the HB14 compatibility proof using ordinary addon HTTP serving and Nuvio 0.8.4-beta's normal native TorBox integration. No addon-specific TorBox backend was involved. Deterministic repository facts remained separate from this manual observation: publication contained exactly 54 entries ending CB51→HB14; HB14 remained S3E17, `The Slashing Opera`, with its existing torrent identity; HB15 was absent; and no CB52 or EX entry appeared. The owner-confirmed real-device results were:

- Nuvio selected HB14 after CB51, offered and resolved the native TorBox stream, and started the expected episode: **PASS**.
- The actual spoken audio was Japanese, and Nuvio exposed and selected the track as Japanese: **PASS**. Playback was not English-only, and no unexpected subtitle behavior occurred.
- Seek forward, seek backward, resume preservation, Continue Watching visibility, and reopening HB14 from Continue Watching at its saved position: **PASS**.
- Natural completion recognition: **PASS**. HB15 remained absent and unplayable, and no unexpected next episode was selected.
- The terminal Details-screen focus trap reproduced. It remains an accepted, non-blocking client/UI limitation with unresolved attribution; this observation does not prove that Nuvio or the addon caused it.
- Other unexpected behavior: **none**.

The media-inspection evidence remains unchanged and records one AAC LC stereo track with raw/container language tag `eng` plus zero embedded subtitle streams. The manual spoken-language observation does not claim that ffprobe or the container identified Japanese. Because the generator has no separate validated-spoken-language evidence field, HB14's deterministic user-facing stream title omits the misleading `ENG` token while retaining `AAC 2.0`; no Japanese tag, subtitle, external subtitle URL, or new evidence schema was invented. The earlier 38/38 user-side availability gate is only a checkpoint observation and does not claim permanent swarm availability or future TorBox cache persistence. No private integration material is recorded.

### Hollowed current-raw representative batch validation

Later on **2026-08-22**, the project owner completed representative validation of the published Hollowed current-raw batch using Nuvio 0.8.4-beta, ordinary local addon HTTP serving, and Nuvio's normal native TorBox integration, with no addon-specific TorBox backend. The owner did **not** manually play all 37 newly published episodes end-to-end. This batch decision combines the following owner-confirmed real-device sample with deterministic editorial, projection, torrent, acquisition, and verified-media evidence.

Catalog and order validation confirmed the full 91-entry publication: HB15 appeared as S3E18; HB29 appeared as S3E32; HB0.8 immediately followed as S3E33; HB30 immediately followed as S3E34; and HB50 appeared as S3E54. Season 4 / Chipped remained absent, and no HB51+, CB52+, or EX entry appeared.

The directly sampled results were:

- **HB14→HB15:** Nuvio selected HB15 next, offered and resolved its native TorBox stream, and started playback. Spoken audio was observed as Japanese; playback was not English-only; no unexpected subtitle behavior occurred; forward and backward seeking passed; and no unexpected episode was selected.
- **HB29→HB0.8→HB30:** after HB29, Nuvio selected HB0.8, offered/resolved its native TorBox stream, and started it. HB0.8 spoken audio was observed as Japanese; playback was not English-only; subtitle behavior was not unexpected; and seeking worked in both directions. Nuvio then selected HB30, offered/resolved its native TorBox stream, and started it. No unexpected episode was selected at either boundary.
- **HB34 duration-discrepancy sample:** native TorBox offer/resolution, playback start, Japanese spoken audio, forward/backward seeking, near-end seeking, natural completion, and selection of HB35 all passed. No unexpected subtitle behavior, persistent audio after exit/completion, or other unexpected behavior occurred during this sample.
- **HB36 corrected-torrent/duration-discrepancy sample:** native TorBox offer/resolution, playback start, Japanese spoken audio, forward/backward seeking, near-end seeking, natural completion, and selection of HB37 all passed. No unexpected subtitle behavior, persistent audio after exit/completion, or other unexpected behavior occurred during this sample. The corrected torrent identity remained unchanged.
- **HB50 terminal sample:** native TorBox offer/resolution, playback start, Japanese spoken audio, forward/backward and near-end seeking, and natural completion all passed. Chipped remained absent, there was no published next episode, and no HB51, CB52, or EX entry was selected. Persistent audio did not occur and no other unexpected behavior was reported during this sample. The terminal Details-screen focus trap reproduced.

The spoken-Japanese observations above apply only to the episodes actually checked for speech: HB15, HB0.8, HB34, HB36, and HB50, in addition to the earlier HB14 proof. They are owner-confirmed playback observations, not ffprobe or container facts, and are not generalized to the other Hollowed files. Every raw/container `eng` observation remains intact. The project-level Hollowed presentation policy continues to omit unvalidated semantic `ENG`/`JPN` tokens; it does not add Japanese tags or subtitles.

The batch lock is supported by deterministic editorial normalization and projection; the exact owner-selected 38-record current-raw membership; deterministic acquisition and torrent verification across 33,764/33,764 pieces; the owner-confirmed 38/38 qBittorrent seeding and 38/38 TorBox Download Ready checkpoints; full catalog/order confirmation; the complete HB14 proof; and the HB15, HB29→HB0.8→HB30, HB34, HB36, and HB50 samples above. It does not claim exhaustive episode-by-episode playback, manual spoken-language verification of every file, permanent public swarm availability, future TorBox cache persistence, resolution of the observations below, future-v3 adoption, or authorization to publish Chipped.

Three UI/playback observations remain separate, accepted/non-blocking, and unresolved:

- **Terminal focus trap:** HB50 reproduced the same Details-screen focus trap seen at earlier terminal publication boundaries. It is accepted and non-blocking, and attribution remains unresolved; this does not prove a Nuvio or addon defect.
- **Intermittent persistent audio after exit:** the owner reports that audio has sometimes continued after exiting Bleach playback and has occasionally continued after backing out to the Google TV home screen. The owner has not observed it with One Pace Premium or other movies/shows, but no controlled A/B reproduction was performed. It did not reproduce during the later HB34, HB36, or HB50 samples. The observation is intermittent, Bleach-observed, currently non-blocking, and attribution remains unresolved; no Nuvio, addon, or TorBox cause is inferred.
- **Transient all-video playback-unavailable incident:** all Bleach videos temporarily stopped playing. During investigation, the owner confirmed the repository HEAD was correct, Node was still listening on port 7000, and the manifest plus CB1, HB14, and HB15 stream endpoints each returned HTTP 200 with valid data. Playback self-resolved without a repository or data fix. The incident is a transient playback-availability anomaly, the addon HTTP/runtime endpoints were observed healthy locally, it is currently non-blocking, and attribution remains unresolved.

## Current publication and final Season 2 entry

On 2026-08-16, before the 33-entry publication expansion, the user confirmed that every remaining exact deterministic preboundary torrent for CB4–CB35, including CB27.5, was loaded and seeding against its verified payload, added to TorBox, and successfully cached/available in the user's environment. No TorBox identifier, account data, private URL, or credential is recorded here.

That operational precondition supported controlled publication and compatibility sampling. It does not establish permanent public swarm availability, availability with all seeds offline, arbitrary third-party discovery, or future TorBox cache persistence.

The source spreadsheet identity remains `concentrated:0.0`, displayed identifier `0.0`, title `the rotator / the sand`. The separate Watch Guide identity remains guided `35.5`. The project-owner resolution `editorial-resolution:concentrated-35.5-to-0.0` links those facts for the default watch order without rewriting either source. The record keeps permanent ID `cb_0p0`, is published and compatibility-locked as S2E28/global index 37. CB36 begins the representative Arrancar batch at S3E1/global index 38 and is now compatibility-locked with the rest of the published Concentrated prefix.

Inspection found the local 35.5 media suitable for this unambiguous mapping. Its exact deterministic trackerless torrent exists in the ignored local workspace, all 51 pieces verified against the payload, the acquisition manifest includes `cb_0p0`, and verified-media evidence exists at `evidence/media/cb_0p0.json`. The project owner confirmed the exact torrent is seeded and cached in the user's TorBox environment. Production meta, stream, and provenance include `cb_0p0`, with provenance retaining the owner-resolution reference. The 2026-08-20 real-device terminal test passed every functional CB35→CB35.5 requirement while reproducing the accepted focus limitation. No permanent public availability claim has been made.

## Batch compatibility-lock meaning

For the explicit 91-entry locked prefix, `locked:true` means the addon-facing identity, order, torrent, and stream compatibility contract is accepted as the stable baseline; future changes require deliberate revalidation. The first 37 entries retain their preboundary history. The CB36–CB51 extension retains its deterministic evidence and representative Arrancar coverage. HB14 retains its separately validated compatibility proof. The additional 37 Hollowed locks combine the complete deterministic 38-record technical basis and availability checkpoint with full catalog/order confirmation and the representative boundary, duration-discrepancy, corrected-torrent, and terminal samples recorded above. Publication and compatibility lock remain separate decisions; these locks were applied only after the owner accepted that representative validation.

The batch lock does **not** mean every episode was manually played, every Hollowed file's spoken language was manually verified, every Nuvio UI behavior is bug-free, the terminal-completion focus trap is resolved, the intermittent persistent-audio or transient playback-unavailable observations are resolved, permanent public swarm availability is proven, future TorBox cache persistence is guaranteed, future-v3 media is adopted, or Chipped is authorized. CB1–CB3 retain their stronger individually established historical fixtures; the remainder is explicitly documented representative validation.

## Arrancar technical-acquisition state

The default Concentrated Arrancar span CB36–CB51 now has a separate deterministic technical-acquisition artifact at `evidence/acquisition/concentrated-arrancar.json` and verified-media evidence at `evidence/media/cb_36.json` through `evidence/media/cb_51.json`. Each exact single-file BitTorrent v1 artifact was created without trackers or web seeds, independently recreated to confirm byte determinism, and verified piece-by-piece against its unchanged local payload. The 16 torrents total 4,771 verified pieces with zero mismatches.

The project owner subsequently confirmed all 16 exact torrents at 100% and seeding and confirmed all 16 were acquired/cached in the user's TorBox environment. Representative Nuvio validation then passed the CB35.5→CB36 season boundary, the CB36 full sample, the CB43 middle sample, CB50→CB51, CB51 playback/completion, and the correct terminal absence of HB14 and CB52. CB36–CB51 are now `locked:true` as a representative batch, not as a claim of individual end-to-end playback for every entry. The torrent artifacts live only under the ignored local `sources/torrents/concentrated-arrancar/` workspace. No permanent availability or future-cache claim is made.

The Watch Guide's optional CB50 instruction remains separate from the default timeline: pause CB50 at 16:15, play Hollowed 11.5, then resume CB50. This checkpoint does not create Hollowed 11.5 evidence or add it to the primary series.

## Hollowed current-raw technical-acquisition state

The owner-selected default current-raw span Hollowed 14–29, Hollowed 0.8, and Hollowed 30–50 has a separate 38-entry technical-acquisition artifact at `evidence/acquisition/hollowed-current-raw.json` and verified-media evidence at `evidence/media/hb_14.json` through `evidence/media/hb_50.json`, including `hb_0p8.json` in registry order. The source payloads are MP4 files. Each single-file BitTorrent v1 artifact is trackerless, was independently recreated byte-for-byte, and was verified against its exact payload; all 33,764 pieces matched.

Inspection observed one HEVC video and one AAC LC stereo audio track per file with the raw/container tag `eng`, with no embedded subtitle streams, attachments, or warnings. The filename marker `(sub)` is retained as payload identity but does not create subtitle evidence. HB34 measured 2074.864458 seconds versus the 2133-second editorial runtime, while HB36 measured 2657.529875 seconds versus the 2568-second editorial runtime; those deltas remain technical provenance and do not replace normalized editorial runtime. The local torrents remain ignored. The project owner confirmed all 38 at 100% and seeding and all 38 Download Ready in TorBox; no credentials or private URLs are recorded. All 38 now have ordinary production meta/stream/provenance output and are compatibility-locked after representative validation. A project-level presentation rule preserves every raw `eng` fact but omits semantic `ENG`/`JPN` tokens from current Hollowed stream titles unless separately validated spoken-language evidence later authorizes one. Japanese speech was manually observed only for HB14, HB15, HB0.8, HB34, HB36, and HB50; no spoken language is inferred for the remaining files. Permanent availability and future-v3 adoption are not claimed.

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
curl http://127.0.0.1:7000/stream/series/hb_14.json
curl http://127.0.0.1:7000/stream/series/hb_50.json
```

`127.0.0.1` and `localhost` always refer to the device making the request. A TV must use a manifest URL it can reach, normally using the host computer's LAN IP address. DHCP changes or reboots may change that address and require updating the installed manifest URL; the repository must not record the private LAN IP itself.

## Regression gate

Automated tests protect the 91-entry deterministic publication and compatibility-locked prefix ending `hb_48`, `hb_49`, `hb_50`; preserve all stream, torrent, acquisition, verified-media, Concentrated, and HB14 identities; omit unvalidated Hollowed semantic language tokens; and keep Chipped, HB11.5, EX, Concentrated CB52+, and Hollowed 51–62 unpublished and unlocked. Tests do not reproduce the user-confirmed availability gate or manual Nuvio/TorBox experiments. The dated records preserve the terminal focus trap, intermittent persistent audio, and transient playback-unavailable incident as non-blocking observations with unresolved attribution.
