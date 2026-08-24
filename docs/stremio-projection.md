# Stremio/Nuvio projection contract

This document defines a design-time projection from the committed Bleach editorial model to a future public Stremio presentation. It does not generate or authorize changes to catalog, meta, stream, provenance, or runtime files.

## Compatibility premise

The primary series remains `bleach-manga-cut`. Its long-term projected seasons are:

1. Substitute Soul Reaper
2. Soul Society
3. Arrancar
4. The Lost Agent

This is an arc-oriented viewer presentation, not a replacement for source-project identity. Every projected record retains its permanent `videoId`, `projectId`, normalized `recordId`, exact string source identifier, authoritative title, and editorial provenance.

Nuvio 0.8.4-beta determines a series' next episode by globally sorting all videos by `season` and then `episode`. Season boundaries do not interrupt this sequence, and Season 0 is not isolated. Consequently, the generated primary `meta.videos` list must always be an approved contiguous prefix of the default watch timeline.

## Projection and publication are independent

`projectedPlacement` is the intended future season-local location. It may be assigned when the authoritative arc and season-local order are known.

`publicationEligibility` determines whether an entry may enter public Stremio metadata now. Its states are:

- `eligible`: every publication gate passes.
- `blocked`: placement is known, but one or more gates prohibit publication.
- `excluded`: the editorial state prohibits publication.
- `unresolved`: placement, navigation, or another required decision is unresolved.

Publication gates cover `editorialAvailability`, `resolvedPlacement`, `mediaEvidence`, and `defaultTimelineContiguity`. Projection never constitutes evidence that media or a stream exists.

The current eligible, published, and compatibility-locked prefix contains 93 entries: all 53 default Concentrated entries through CB51, including CB27.5 and guided 35.5 / `cb_0p0`, followed by all 38 owner-selected current-raw Hollowed entries through HB50, then Chipped #01–#02 / `ch_1`–`ch_2` as a two-episode compatibility POC extension. Chipped #02 is locked after owner-confirmed compatibility validation. The projection has 93 eligible and 10 blocked entries. Every remaining primary entry, beginning with Chipped #03, uses the generic `unpublished-primary` gate until publication is explicitly approved and the contiguous prefix advances. The final 37 Hollowed locks record a separate representative validation decision rather than following automatically from publication.

## Resolved guided 35.5 relationship

The source identities remain distinct:

```text
Spreadsheet source identity: concentrated:0.0 / 0.0
Watch Guide identity: Concentrated Bleach 35.5
Permanent internal ID: cb_0p0
```

The project-owner decision `editorial-resolution:concentrated-35.5-to-0.0`, dated 2026-08-17, resolves the guided identifier to the spreadsheet record. The direct Watch Guide evidence remains attached to raw range `10-35.5` and raw endpoint `35.5`; the mapping to `concentrated:0.0` is traced through the resolution record rather than attributed to either source document.

The canonical sequence is:

```text
CB35       → S2E27 → global index 36
guided 35.5 / cb_0p0 → S2E28 → global index 37
CB36       → S3E1  → global index 38
```

All 103 projected entries have resolved global indexes. `cb_0p0` is published and compatibility-locked at S2E28/global index 37. Verified-media evidence exists, the project owner confirmed the exact torrent is seeded and acquired/cached in the user's TorBox environment, and the corrected real-device terminal path was validated on 2026-08-20. This does not establish permanent public availability or future cache persistence.

## Current Hollowed membership resolution

The project-owner decision `editorial-resolution:hollowed-current-raw-membership`, dated 2026-08-21, selects the existing raw-record default membership for current Hollowed acquisition planning: Hollowed 14–29, Hollowed 0.8, then Hollowed 30–50. These exact 38 records already form the projected Hollowed default span at S3E17–S3E54/global indexes 54–91.

This is a current-version membership selection, not a placement resolution or publication approval. The spreadsheet's combined/reworked v3 notes remain preserved as unresolved source claims. Usable v3 media and sufficiently authoritative future-v3 correspondence are not currently available to the project; therefore no future asset automatically supersedes, merges, aliases, obsoletes, rekeys, or renumbers the selected raw records. Any v3 adoption requires a fresh audit and explicit owner-reviewed migration decision.

The 38 ignored local MP4s are acquisition payloads rather than editorial authority. A separate 38-entry technical-acquisition manifest and 38 verified-media records now preserve their exact deterministic trackerless torrent identities and observed media facts. All 33,764 pieces verified, and a second complete torrent creation was byte-identical. Inspection observed one HEVC video and one AAC LC stereo track with raw/container tag `eng` per MP4, with no embedded subtitle streams, attachments, or warnings; `(sub)` in a payload filename is not treated as subtitle evidence.

HB34 and HB36 retain their measured-duration discrepancies as technical provenance without replacing normalized editorial runtime. The local torrent files remain ignored. The project owner confirmed the 38/38 qBittorrent seeding and TorBox Download Ready availability gate; no private integration material is recorded. All 38 selected records are published, compatibility-locked, and served through ordinary `hb_` runtime handling after the 2026-08-22 validation described below. Future v3 migration remains a separate owner-reviewed decision.

## Stable video IDs

IDs encode only source project and exact displayed identifier syntax:

| Source | Encoding | Example |
|---|---|---|
| Concentrated integer | `cb_<unpadded integer>` | `01` → `cb_1` |
| Concentrated decimal | `cb_<parts joined by p>` | `27.5` → `cb_27p5` |
| Hollowed integer | `hb_<unpadded integer>` | `14` → `hb_14` |
| Hollowed decimal | `hb_<parts joined by p>` | `11.5` → `hb_11p5` |
| Chipped `#` integer | `ch_<unpadded integer>` | `#01` → `ch_1` |
| Hollowed EX | `hb_ex_<unpadded integer>` | `EX 27` → `hb_ex_27` |

Decimals are encoded lexically and never parsed as floating-point positions. Decimal syntax does not imply any editorial `kind`. Unknown identifier syntax is a validation error. IDs do not depend on title, season, episode, array order, or watch-order position.

The registry is append-only. `published` means an ID belongs to a currently published entry; `reserved` means only that the assignment cannot be reused. Registry presence never implies publication. All 93 IDs through Chipped #02 are published and compatibility-locked after explicit validation decisions. All assignments from Chipped #03 onward remain reserved and unlocked.

## Compatibility-lock baseline

The compatibility-locked prefix is now the explicit 93 IDs through Chipped #02. This is a sequence of deliberate validation decisions, not a consequence of publication. CB1–CB3 retain stronger individually established historical fixtures. The first 37 entries retain their prior preboundary validation history; CB36–CB51 retain representative Arrancar validation; HB14 retains its separate complete proof; the remaining 37 Hollowed entries are accepted as a representative batch under the technical and real-device basis below; and Chipped #01–#02 retain their separate owner-confirmed compatibility decisions.

Here, `locked:true` means the addon-facing identity, order, torrent, and stream compatibility contract is accepted as the stable baseline and any future change requires deliberate revalidation. It does not mean every episode was manually played, every client behavior is bug-free, permanent public availability is proven, or future cache persistence is guaranteed.

The 2026-08-20 Nuvio 0.8.4-beta/native-TorBox test passed visibility at S2E28, CB35→CB35.5 navigation, playback, Japanese audio, embedded subtitles, seek, resume, Continue Watching, natural completion, both backing-out focus checks, and the correct absence of CB36. Natural terminal completion of `cb_0p0` reproduced a Details-screen focus trap. This is a known, accepted, non-blocking client/UI limitation with unresolved attribution; it is not classified as a proven Nuvio, Bleach-addon, TorBox, or torrent defect. Backing out to Nuvio Home and re-entering Bleach Details restores normal navigation. A terminal One Pace Premium A/B control was unavailable because its final listed episode is unreleased and has no playable stream.

The representative Arrancar validation on 2026-08-20 passed the CB35.5→CB36 season transition; CB36 native-TorBox playback, Japanese audio, embedded subtitles, seek, resume, and Continue Watching; CB43 native-TorBox playback, Japanese audio/subtitles, and seek; CB50→CB51; CB51 native-TorBox playback and natural completion; and the correct absence of HB14 and CB52 after CB51. Nothing else unexpected was reported. The owner did not manually play all 16 Arrancar episodes end-to-end.

The CB36–CB51 batch lock combines normalized editorial/projection data, deterministic verified-media evidence, independent byte-identical torrent recreation, 4,771/4,771 piece verification, 16/16 user-side qBittorrent seeding, 16/16 user-side TorBox acquisition/cache confirmation, and representative beginning/middle/end playback and boundary coverage. The Details-screen focus trap reproduced after CB51 natural completion. This repeated terminal-completion observation remains a known, non-blocking client/UI limitation with unresolved attribution; it is not classified as a proven Nuvio, Bleach-addon, TorBox, or torrent defect. Backing out to Nuvio Home, where Bleach remains selected, and re-entering Bleach Details restores normal navigation.

On 2026-08-22, the project owner completed HB14 validation using ordinary addon HTTP serving and Nuvio 0.8.4-beta's native TorBox integration, without an addon-specific TorBox backend. CB51→HB14 ordering, S3E17 placement, native stream offer/resolution, playback start, seek in both directions, resume, Continue Watching, reopening at the saved position, and natural completion all passed. HB15 remained absent and unplayable; no CB52, EX entry, or unexpected next episode appeared. The actual spoken audio was observed as Japanese, and Nuvio exposed and selected Japanese; playback was not English-only and no unexpected subtitle behavior occurred. These are owner-confirmed real-device observations, not ffprobe/container observations.

Raw technical evidence remains unchanged: inspection records one AAC LC stereo track with raw/container language tag `eng` and zero embedded subtitle streams. Because no separate validated-spoken-language evidence field exists, deterministic generation omits HB14's misleading user-facing `ENG` token while retaining `AAC 2.0`; it does not rewrite the tag as Japanese, create a subtitle claim, or introduce a new evidence schema. The terminal Details-screen focus trap reproduced and remains accepted and non-blocking with unresolved attribution; the result does not establish whether Nuvio or the addon caused it. The prior availability gate is not a permanent swarm-availability or future-cache-persistence claim, and no private integration material is recorded.

Later on 2026-08-22, the owner confirmed the full 91-entry catalog/order in Nuvio 0.8.4-beta through ordinary local addon HTTP serving and the normal native TorBox integration: HB15 was S3E18; HB29→HB0.8→HB30 occupied S3E32→S3E33→S3E34; HB50 was S3E54; and Season 4 / Chipped, HB51+, CB52+, and EX content remained absent. HB14→HB15 selection/playback/seek passed. HB29→HB0.8→HB30 selection and playback passed, with seek testing on HB0.8. HB34 and corrected HB36 each passed native stream resolution, playback, bidirectional and near-end seek, natural completion, and correct next-episode selection. HB50 passed resolution, playback, seek, natural completion, and the terminal absence of a published next episode. No unexpected subtitle behavior occurred in the explicitly checked HB15, HB0.8, HB34, HB36, and HB50 samples.

Spoken Japanese was owner-observed for HB15, HB0.8, HB34, HB36, and HB50, in addition to the earlier HB14 proof. That observation is not generalized to untested files and is not converted into a container fact: every raw `eng` observation and the project-level suppression of unvalidated semantic `ENG`/`JPN` title tokens remain unchanged. The owner did not manually play all 37 newly published Hollowed episodes end-to-end.

The 37-entry Hollowed batch lock combines deterministic normalization/projection, the exact owner-selected 38-record membership, deterministic acquisition/torrent evidence with 33,764/33,764 pieces verified, the owner-confirmed 38/38 qBittorrent seeding and 38/38 TorBox Download Ready checkpoints, full catalog/order confirmation, the full HB14 proof, and the HB15, insertion-boundary, HB34, corrected-HB36, and terminal-HB50 samples. It does not claim exhaustive playback, spoken-language verification of every file, permanent swarm availability, future cache persistence, future-v3 adoption, or Chipped authorization.

HB50 reproduced the accepted, non-blocking terminal Details-screen focus trap; attribution remains unresolved. Intermittent Bleach audio continuing after playback exit, occasionally through return to the Google TV home screen, is separately recorded as Bleach-observed, currently non-blocking, and unresolved. No controlled A/B reproduction was performed, and it did not occur during the later HB34, HB36, or HB50 samples; no Nuvio, addon, or TorBox cause is inferred. A separate transient all-video playback-unavailable incident self-resolved without a repository/data fix while the owner observed the correct HEAD, Node listening on port 7000, and HTTP 200 with valid data from the manifest, CB1, HB14, and HB15 endpoints. The addon HTTP/runtime endpoints were locally healthy during that investigation; the anomaly remains non-blocking with unresolved attribution.

## Titles

Projected titles equal their normalized authoritative project titles exactly. Project labels are not prepended. In particular, CB1 remains `Death and Strawberry`.

## Default projection

The projection contains the Watch Guide's currently selected default ranges:

- S1: Concentrated 01–09.
- S2: Concentrated 10 through CB35, including source record 27.5 in normalized source order, followed by source record `concentrated:0.0` as guided 35.5 at S2E28.
- S3: Concentrated 36–51 followed by Hollowed 14–50; Hollowed 0.8 remains between Hollowed 29 and 30 as established by the normalized source order and EX27 relationship.
- S4: Chipped #01–#12.

The projection has 103 entries: 9 in S1, 28 in S2, 54 in S3, and 12 in S4. Global positions are resolved monotonically from 1 through 103.

Current publication is the first 93 canonical entries through Chipped #02 at S4E2/global index 93. Chipped #01–#02 are both compatibility-locked one-episode POC extensions; Chipped #03 is the first unpublished canonical suffix entry at S4E3/global index 94. Concentrated CB52+ and Hollowed 51–62 are not the next selected default Watch Guide entries. The generic suffix blocker is now `primary-publication-prefix-after-ch_2`; prefix closure continues to prevent gaps without a special project barrier.

The default Concentrated Arrancar span CB36–CB51 has a separate 16-entry technical-acquisition manifest and verified-media evidence. Its trackerless local torrents were independently recreated byte-for-byte and all 4,771 pieces were verified against the unchanged payloads. Those torrent artifacts remain in the ignored local workspace. The project owner confirmed the exact 16 torrents are user-seeded and acquired/cached in the user's TorBox environment. Following representative real-device validation, CB36–CB51 are published and `locked:true` as a batch. This does not claim that every entry was individually played or establish permanent availability or future cache persistence.

The owner-selected default Hollowed span has separate technical evidence at `evidence/acquisition/hollowed-current-raw.json` and in 38 `evidence/media/hb_*.json` records. All 38 explicitly approved Hollowed records generate ordinary meta, stream, and provenance output from that evidence and are now compatibility-locked after representative validation. Technical evidence, publication authorization, and compatibility locking remain separate gates.

## Optional content

HB11.5, EX1, EX27, and EX50 have no primary-series season or episode placement. They cannot enter primary `meta.videos` under the current design, and no runtime representation is selected.

HB11.5 preserves this guided relationship exactly:

```text
CB50
pause at 16:15
→ HB11.5
→ resume CB50 at 16:15
```

EX27 remains an optional replacement for Hollowed 27–29 with this exact route:

```text
HB26 → EX27 → HB0.8 → HB30
```

EX1 and EX50 remain optional transition variants. All EX current/legacy and media-availability gates remain unresolved.

Future Nuvio experiments may compare isolated non-episodic/movie meta items in a dedicated optional-content catalog with another representation outside the primary series' next-episode ordering. Neither option is selected here.

## Validation rules

The projection validator enforces:

- The primary series and arc seasons remain stable.
- CB1 remains `cb_1`, S1E1, and `Death and Strawberry`; all locked CB1 files retain their checkpoint hashes.
- Identifier encoding is lexical, unique, append-only, and independent of presentation.
- Projected titles equal normalized titles exactly.
- Source identifier `0.0`, guided identifier `35.5`, and permanent ID `cb_0p0` remain distinct and traceable through the owner resolution.
- `cb_0p0` is the only projection entry with `resolutionRef`; it is published and compatibility-locked at S2E28/global index 37.
- The owner-selected 38-record current raw Hollowed membership exactly matches the existing projected and published Hollowed default span without adding per-entry `resolutionRef` values.
- CB36 is S3E1/global index 38, and every one of the 103 global indexes is resolved.
- The projection contains 93 eligible and 10 blocked entries, and every unpublished primary entry uses the one generic `unpublished-primary` suffix gate beginning at Chipped #03.
- The current 93-entry published prefix is also the explicit 93-entry compatibility-locked prefix after the separate Chipped #02 validation decision; publication never grants a lock automatically.
- Globally sorted eligible primary videos form exactly the approved contiguous prefix.
- Optional and EX IDs cannot enter the primary default timeline.
- HB11.5 and EX27 relationships remain exact.
- Registry reservation does not imply publication.
- Planned, deferred, explicitly-not-planned, or non-generatable records cannot become eligible.
- Editorial projection cannot create torrent, stream, or technical-media claims.
- The resolved 35.5/0.0 and current Hollowed-membership issues are absent from the unresolved ledger; the future-only Hollowed v3 migration issue and the other four remaining issue IDs remain exact.

## Artifact boundaries

The files under `projection/stremio` and `schemas/projection`, plus the projection validator and tests, remain the publication model rather than media evidence. The generated `cb_0p0` production provenance retains `editorial-resolution:concentrated-35.5-to-0.0` as `sourceInputs.projection.resolutionRef`; it does not duplicate or reattribute the owner decision. The accepted focus/persistent-audio/playback-availability observations and sampled spoken-language results are documentation of client/UI behavior, not torrent, container, or network evidence. CB36–CB51 and all 38 current-raw Hollowed production artifacts trace their ordinary normalized records, projection entries, and verified-media records without inventing resolution references. Hollowed raw `eng` observations remain in technical evidence while a project-level presentation policy suppresses unvalidated semantic language tokens; Japanese speech is claimed only for the six manually sampled Hollowed episodes. Chipped #01 traces its existing editorial, acquisition, and verified-media evidence through the ordinary production path and is locked after the separate owner-confirmed compatibility decision. Chipped #02 traces the same evidence through the ordinary production path and is locked after the separate owner-confirmed compatibility decision. Chipped #03–#12 and optional-content runtime experiments require separate publication approval.
