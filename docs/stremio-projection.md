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

The current eligible and published prefix contains 37 entries through guided 35.5 / `cb_0p0`, including CB27.5. The projection has 37 eligible and 66 blocked entries. Every remaining primary entry, beginning with CB36, uses the generic `unpublished-primary` gate until media evidence is approved and the contiguous prefix advances.

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

All 103 projected entries have resolved global indexes. `cb_0p0` is published at S2E28/global index 37 and remains `locked:false`. Verified-media evidence exists, and the project owner confirmed the exact torrent is seeded and acquired/cached in the user's TorBox environment. Nuvio playback validation remains pending; this does not establish permanent public availability or future cache persistence.

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

The registry is append-only. `published` means an ID belongs to a currently published entry; `reserved` means only that the assignment cannot be reused. Registry presence never implies publication. The 37 current prefix IDs through `cb_0p0` are published; CB1–CB3 are locked, while CB4–CB35 and `cb_0p0` remain unlocked. CB36+ and all other unpublished assignments remain reserved.

## Titles

Projected titles equal their normalized authoritative project titles exactly. Project labels are not prepended. In particular, CB1 remains `Death and Strawberry`.

## Default projection

The projection contains the Watch Guide's currently selected default ranges:

- S1: Concentrated 01–09.
- S2: Concentrated 10 through CB35, including source record 27.5 in normalized source order, followed by source record `concentrated:0.0` as guided 35.5 at S2E28.
- S3: Concentrated 36–51 followed by Hollowed 14–50; Hollowed 0.8 remains between Hollowed 29 and 30 as established by the normalized source order and EX27 relationship.
- S4: Chipped #01–#12.

The projection has 103 entries: 9 in S1, 28 in S2, 54 in S3, and 12 in S4. Global positions are resolved monotonically from 1 through 103.

Current publication is the first 37 canonical entries through guided 35.5 / `cb_0p0`. CB36 is the first unpublished canonical suffix entry. The generic suffix blocker is now `primary-publication-prefix-after-cb_0p0`; prefix closure continues to prevent gaps without a special CB36 barrier.

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
- `cb_0p0` is the only projection entry with `resolutionRef`; it is published at S2E28/global index 37 and remains `locked:false`.
- CB36 is S3E1/global index 38, and every one of the 103 global indexes is resolved.
- The projection contains 37 eligible and 66 blocked entries, and every unpublished primary entry uses the one generic `unpublished-primary` suffix gate beginning at CB36.
- Globally sorted eligible primary videos form exactly the approved contiguous prefix.
- Optional and EX IDs cannot enter the primary default timeline.
- HB11.5 and EX27 relationships remain exact.
- Registry reservation does not imply publication.
- Planned, deferred, explicitly-not-planned, or non-generatable records cannot become eligible.
- Editorial projection cannot create torrent, stream, or technical-media claims.
- The resolved 35.5/0.0 issue is absent from the unresolved ledger; the five remaining issue IDs remain exact.

## Artifact boundaries

The files under `projection/stremio` and `schemas/projection`, plus the projection validator and tests, remain the publication model rather than media evidence. The generated `cb_0p0` production provenance retains `editorial-resolution:concentrated-35.5-to-0.0` as `sourceInputs.projection.resolutionRef`; it does not duplicate or reattribute the owner decision. Future media acquisition, optional-content runtime experiments, or publication beyond CB35.5 require separate approval.
