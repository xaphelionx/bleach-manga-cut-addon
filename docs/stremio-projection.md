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

Only the already-validated CB1 entry is currently eligible. Other projected default entries lack approved media evidence. The unresolved Watch Guide boundary additionally blocks every default entry after CB35.

## Unresolved 35.5 boundary

The source claims remain separate:

```text
CB35
→ unresolved Watch Guide endpoint 35.5
→ CB36
```

```text
concentrated:0.0 — the rotator / the sand
```

The Watch Guide endpoint has no resolved record ID. `concentrated:0.0` has reserved ID `cb_0p0`, no primary placement, and no asserted equivalence to `35.5`. No placeholder or fake episode is created.

CB36 can safely have projected placement S3E1. It and all later default records have an unresolved `defaultTimelinePosition`; no global index is assigned after CB35 because doing so would assume whether `35.5` adds a timeline item.

Because Nuvio crosses season boundaries, every S3 and S4 default entry remains publication-blocked while `concentrated-35.5-vs-0.0` is unresolved. This is a publication constraint caused by client navigation behavior, not uncertainty about the later normalized records or their season-local placements.

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

The registry is append-only. `published` means an ID belongs to a currently published entry; `reserved` means only that the assignment cannot be reused. Registry presence never implies publication. CB1 is the sole published and locked assignment; all other normalized and EX assignments are reserved.

## Titles

Projected titles equal their normalized authoritative project titles exactly. Project labels are not prepended. In particular, CB1 remains `Death and Strawberry`.

## Default projection

The projection contains the Watch Guide's currently selected default ranges:

- S1: Concentrated 01–09.
- S2: the safely resolved Concentrated prefix from 10 through CB35, including the source record 27.5 in its normalized source order.
- S3: Concentrated 36–51 followed by Hollowed 14–50; Hollowed 0.8 remains between Hollowed 29 and 30 as established by the normalized source order and EX27 relationship.
- S4: Chipped #01–#12.

The S1/S2 prefix has deterministic global positions 1–36. S3/S4 retain only season-local projected placements and explicitly unresolved global positions.

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
- `35.5` and `concentrated:0.0` remain separate with no placeholder or equivalence.
- No global timeline index exists after CB35.
- CB36 retains projected placement S3E1.
- S3/S4 remain blocked by the unresolved boundary.
- Globally sorted eligible primary videos form exactly the approved contiguous prefix.
- Optional and EX IDs cannot enter the primary default timeline.
- HB11.5 and EX27 relationships remain exact.
- Registry reservation does not imply publication.
- Planned, deferred, explicitly-not-planned, or non-generatable records cannot become eligible.
- Editorial projection cannot create torrent, stream, or technical-media claims.
- All six committed unresolved editorial issues remain unchanged.

## Artifact boundaries

The files under `projection/stremio` and `schemas/projection`, plus the projection validator and tests, are design artifacts only. They do not modify Stremio output or runtime behavior. A future generator, media acquisition, optional-content runtime experiment, or publication decision requires separate approval.
