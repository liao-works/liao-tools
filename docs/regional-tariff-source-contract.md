# Region-aware tariff source contract (draft, NOT wired to production)

This note coordinates the GB/XI measure evidence work in
liao-works/cursor-tax-tools with the Tauri desktop consumer. The backend
canonical file is currently an evidence-only SQLite and must never replace
the installed tariffs.db or the existing latest-data Release.

## Why one row with GB / NI string columns is insufficient

For one 10-digit commodity code there can be multiple simultaneous import
measures distinguished by region, measure type, geography, additional code,
origin, validity and conditions. A stored "0%" for Channel Islands
(geography 1080) is NOT the same thing as an unrestricted 103/1011 GB duty.
The XI V2 103 candidate is also not yet certified as the web UI "Other" row.

Proposed future read-only query envelope (contract draft, not API shipped):

    {
      "code": "0207412010",
      "region": "GB",
      "as_of": "2026-10-14",
      "source_scope": "official-full-measures-when-validated",
      "snapshot_version": "v4.0.1626",
      "status": "review_required",
      "measures": [
        {
          "measure_sid": "123",
          "measure_type": "103",
          "geography": "1080",
          "duty_expression": "0%",
          "conditions": null,
          "effective_start": "2026-01-01",
          "effective_end": null,
          "source_status": "official-measure-not-applicability-certified"
        }
      ],
      "source_provenance": {"sha256": "...", "verified_at": "..."}
    }

**Rules for the eventual UI:**

1. The user must explicitly select GB or XI; never silently reuse a measure
   across regions or display Channel Islands' 0% as the GB default.
2. Show the full duty expression, including currency and quantity units.
   Never strip a compound component or assume no measure means 0%.
3. Display additional codes, documents, conditions and date, or show a
   deliberate "review required" state when incomplete.
4. Offer an official source link and separate "official measure present"
   from "business-specific rate / payable duty confirmed".
5. Exact HS code queries only for rate display. Fuzzy matching may assist
   code selection, but is not an authoritative duty lookup.
6. The installed production snapshots remain frozen until source completeness,
   authenticity, NI Other semantics, measure selection rules and reversible
   signed release channel pass their acceptance gates.

Current branch source:
https://github.com/liao-works/cursor-tax-tools/pull/6

Producer prototype: src/target_duty/region_measures.py
Producer documentation: docs/region-measures-bulk-feasibility.md

No front-end component, Tauri command or production update endpoint is
changed by this contract note; it is an implementation hand-off only.

## October 14 phase-4 source update (still NOT production-wired)

Producer has now **validated an actual full GB DBT expanded-measure export**: v4.0.1626, 1,123,765 measure rows, 16,735 distinct codes, 16,376/16,376 focused 103/1011 code parity and seven explicitly missing special-purpose leaf codes. This supersedes the earlier *gap-only* prototype as available source evidence but still does not mean a certified payable GB duty.

An independent XI nomenclature source has passed a real first-two-chapter canary (863 rows, 516 active declarables). A five-code XI sample captured 287 original import-measure rows with no request errors. The XI Other rate business meaning, full XI coverage and authenticated production source remain **unverified**. The desktop reader **must not** migrate or fill north_ireland_rate from those samples.

See producer docs/full-gb-xi-source-stage.md and PR #6 for provenance. Do not merge or enable automatic replacement of installed tariffs.db.


## Phase 5 — NI origin selector vs third-country measures (2026-10-14)

Upstream official HMRC frontend source confirms the desktop contract **must**
differentiate these two entirely separate concepts:

1. \`country_of_origin = "OTHER"\` is a **selector** for a Rest-of-World
   origin on the NI route. The real ISO country is retained in
   \`other_country_of_origin\` and passed to HMRC via
   \`filter[geographical_area_id]\`; the word OTHER is **not** a 0% duty
   or tariff measure.
2. The official frontend's \`third_country_duties\` measure group includes
   **both 103 and 105**. Selecting only 103/1011 cannot establish exact XI
   display behavior or an applicable rate for arbitrary origins.

Therefore the future desktop display should require an explicit origin before
offering a country-specific NI duty, and must not collapse origin-OTHER,
geography-1011, Channel-Islands-1080, measure-103 and measure-105 into
one "Other rate" column. In absence of adequate applicability evidence,
render \`review_required\` with an official source link rather than a number.

Producer implemented
\`src/target_duty/xi_acceptance.py\`: each raw XI JSON response's actual
SHA-256 and imported measures are replay-verified. The October 14 real
five-code canary replayed 287 measures without a source error but remained
**incomplete: 2 of 97 official chapters; 5 of 516 sampled-chapter codes**.
\`production_eligible=false\` and \`other_semantics_verified=false\`
remain mandatory. Neither PR is authorized for production promotion.

Official UI source:
https://github.com/trade-tariff/trade-tariff-frontend/blob/main/app/models/duty_calculator/steps/import_details.rb
https://github.com/trade-tariff/trade-tariff-frontend/blob/main/config/grouped_measure_types.yml


## Phase 6 — verified XI country-filter origin comparison

Producer official public canary:
https://github.com/liao-works/cursor-tax-tools/actions/runs/38508653594

One current official XI commodity \`0101210000\` returned 42 unfiltered
import measures, but **6** when filtered by US origin and **6** when filtered
by CN origin. Both country-specific filtered responses contained a type-103
geography-1011 candidate whose direct resolved string was empty, but
whose linked official duty-expression base is **0.00 %** and which has
multiple conditions. Never map it to a *payable* 0% or a confirmed
\`north_ireland_rate\`.

Producer offers \`xi_origin_compare.py\` for auditable filtered comparisons
and \`xi_merge.py\` for independently re-validated, atomic bounded shard
assembly. This does not certify payable duty or authorize desktop updates.

**Desktop safety decision:** keep the existing \`north_ireland_rate\`
production field untouched, do not fill \`other_rate\` from country
sentinels, and do not advertise the single legacy string as an
origin-independent legal duty. Future region-aware queries must return
an explicit requested origin, date, measure IDs/conditional states and
a separate \`requires_review\` status where expressions are incomplete.

See producer \`docs/xi-origin-and-batch-merge.md\`.

## Phase 7 — XI frozen-source batches (no desktop import)

Producer now supports exact-byte SHA-256 pinning of a managed XI full
catalogue and repeatable indexed source shards. It can reuse the same
catalogue and last verified checkpoint across approved manual runs, skip
previously successful codes, retry source failures, and replay every
merged record before accepting a cumulative audit. Workflow and operator
runbook: cursor-tax-tools/.github/workflows/xi-managed-coverage.yml and
cursor-tax-tools/docs/xi-frozen-managed-runbook.md.

The optional GitHub Actions cross-run artifacts expire after 30 days and
managed XI API credentials have not yet been exercised for a 97-chapter
full import. Do not infer NI Other or update north_ireland_rate/other_rate
from a mere successful raw-source checkpoint. No signed customer-facing
release is authorized by this stage.

## Phase 8 — GB compact 103/1011 evidence is NOT an app tariff database

Producer src/target_duty/gb_compact_review.py now creates a small
review-only GB SQLite from the independently verified full DBT measure
export. Its tables are provenance, commodities and evidence; this schema
has NO payable rate or north_ireland_rate field and is incompatible with
the installed tariffs.db. Do not import it automatically.

Every active GB commodity leaf remains covered as a status row. A source
type-103/geography-1011 record is merely an evidence candidate: preserve
original duty expression, date, conditions, additions and exclusions.
Geography 1080 (Channel Islands) is stored as explicitly non-GB context
only when explaining unresolved target gaps; never map it to 1011.
Unresolved special Chapter 99 codes must never receive an invented 0%.

First actual DBT full-to-compact replay confirmed 16,376 GB target
codes, 359 non-GB geography-only gaps, seven special missing codes
and 1,123,765 measures in the pinned full source. After the footprint
optimization, a new CI source replay checks compact statistics and size.
All compact outputs preserve production_eligible=false,
rate_applicability_verified=false and ni_other_verified=false.

Official DBT latest-alias returned HTTP 404 during an Oct 14 CI probe.
Reproducible GB data staging uses previously verified pinned v4.0.1626
with a separate independent latest-source health check. A passing pinned
replay must not imply a passing current-freshness gate or justify release.

An explicit sign-off on regional duty applicability, source freshness,
condition evaluation and signing is required before desktop integration.
NI Other, VAT and quota balances are not delivered by this shadow.

## Phase 9: official DBT newest version readiness gate

Do not rely on the DBT commodities-report /versions/latest alias to
establish freshness. The producer's official dataset version inventory
returned 1,947 versions on 2026-10-14; newest **v4.0.1627** is later
than independently verified **v4.0.1626** but its official table listing
is EMPTY. The previous pin's table inventory and CSVW schema work.

Online GB catalogue and focused 103/1011 commands now resolve latest
through exact version discovery, table inventory and CSVW columns.
Until the new official version is fully published and all rows are
replayed successfully, freshness_proven=false, publish_eligible=false.
Any UI or updater must expose this as SOURCE NOT READY, never silently
promote a prior pin as current and never replace production tariffs.db.

Once DBT finishes publication, the operator-only
dbt-newest-replay-shadow.yml replays same-version GB catalogue, focused
baseline and full DBT measures, derives a compact review source, checks
the full candidate count and verifies the official version did not drift
during capture. Its outputs remain review-only and incompatible with
the consumer's installed tariffs.db. NI Other business mapping and
whole-XI managed coverage remain independently blocked.

Producer specification: cursor-tax-tools/docs/dbt-version-readiness-gate.md

## Phase 10: GB source-version diff — candidate evidence only

The producer now has `gb_review_diff.py` to compare two independently
verified, SHA-256-matched GB compact audit SQLite databases. It reports
added/removed active-leaf commodity codes, gained/lost active 103/1011
measure evidence, duty expressions, additional-code/condition changes,
and unresolved gap/status differences. Geography 1080 remains explicitly
non-GB context. A lost GB active candidate, removed commodity or changed
active candidate results in a high-risk review gate.

The manual `dbt-newest-replay-shadow.yml` now requests a prior verified
GB source-proof Actions run ID. Only after official newest version
metadata, complete source rows, and version-drift checks pass can it
compare the new compact review SQLite to the trusted prior compact DB.
High-risk source changes fail acceptance and preserve the audit report.

A real previous-version `v4.0.1626` compact DB was successfully replayed
against itself across 16,742 leaf codes and 16,376 active 103/1011 codes.
This is a *structural self-check*, NOT a newer official-source comparison,
current freshness certification, or proof of an applicable duty.

Never import a compact review DB directly as `tariffs.db`, never overwrite
`north_ireland_rate` from GB, and never treat a missing record as 0%.
Official newest DBT release remains blocked until it exposes required
tables; all consumer source updates remain documentation-only and Draft.

Producer guide: cursor-tax-tools/docs/gb-version-diff-acceptance.md

## Phase 11 — NI complete-source gap planning (review only)

The XI producer now chooses the next bounded HMRC commodity batch from the
**first uncollected or failed XI code**, using the exact frozen official
XI catalogue. Prior successful responses are independently SHA-256
replayed before the planner skips any commodity. Source errors remain
eligible for retries, so manual batch advance cannot silently certify
incomplete NI coverage. The managed operator workflow defaults to
start_index=auto; explicit numeric override is only for review use.

NI goods nomenclature now rejects invalid effective dates and
paginated chapter responses instead of silently classifying unknown
codes as inactive or treating partial pages as complete. XI commodity
JSON:API pagination and mismatched relationship counts are rejected.

Verified public canary: 2 chapters, 863 records, 516 active declarable
codes, 5 source responses independently replayed, **511 missing** in
the sample. The planner returned start_index=5, not a full-source claim.
Managed 97-chapter coverage and final origin-specific NI Other duty
remain NOT verified. No change to north_ireland_rate, other_rate, or
installed tariffs.db is authorized.

See producer docs/xi-full-coverage-run-planning.md. This is a source
contract update only, not desktop executable implementation.

## Phase 12 — per-chapter NI source receipt and final review-only acceptance

The producer has `xi_coverage_receipt.py`: an independently replayed,
chapter-by-chapter receipt for managed XI source coverage. It counts
every active declarable commodity from the original frozen XI catalogue,
with separately reconciled successful, failed and missing source
responses and examples for every chapter. A public partial canary
can never pass a managed-full source gate.

Even the successful `--strict` managed FULL-source receipt only proves
captured raw import-measure source coverage. It **does not certify**
NI `Other` tariff applicability, user-specific origin, conditions,
additional codes, UKIMS or a payable tax calculation; an HMRC atomic
snapshot is not established by multiple separately timed API calls.

The managed manual workflow supports an audit-only final pass once all
codes have already been collected and replayed; it does not refetch
known-successful codes. Its artifact receipt is a QA document, not a
signed desktop tariff pack. The existing `north_ireland_rate`,
`other_rate` and installed tariffs.db MUST remain unchanged.

Producer doc: cursor-tax-tools/docs/xi-chapter-coverage-receipt.md

## Phase 13 — detect NI source drift before resuming a prior checkpoint

Even a frozen NI `as_of` date does not prove that HMRC returns an
atomic/unchanged snapshot across separately timed API calls.
The collector now requires raw-source SHA-256 + measure-row replay before
skipping both prior merged checkpoint successes and local checkpoint
successes. A corrupted `status=ok` record may never be silently skipped.

The producer `xi_drift_guard.py` additionally re-requests up to three
previously verified commodity source anchors (first, middle, last),
canonicalizes the complete original source relationship graph and
compares the old/new semantic SHA-256. Different duty expressions,
conditions or linked data block the old-snapshot resume. A 429, failed
request or malformed response is also blocking, not evidence of zero
duty. The manual managed workflow performs this check before extending
prior checkpoints; the two-chapter public canary separately tests it.

Stable sampled source anchors are explicitly NOT proof that HMRC provided
a globally atomic XI snapshot; source/version consistency and NI
`Other` applicability remain unverified. No review source data is
eligible for direct insertion into `tariffs.db` or any consumer duty
field. See producer docs/xi-cross-run-drift-guard.md.

### Phase 13 audit evidence preservation

NI old/new source drift now has a separate bounded, replay-only SQLite
evidence file containing exact compressed original and newly retrieved
HMRC XI commodity responses with response SHA-256 and discrepancy status.
That SQLite is for manual audit and MUST NOT be accepted by the desktop
importer as a rate database. Its existence neither establishes HMRC
atomic source version continuity nor NI `Other` applicability.

The standalone source collector now independently verifies a previous
merged checkpoint **and its own existing local checkpoint** before
skipping successful codes, even when bypassing the orchestrator.
The drift guard blocks extending a multi-run source snapshot if any
reviewed anchor changes or fails to load. On two real public XI
examples the official source anchor responses were stable for the
same historical as-of date, but 511 commodity sources were still
missing in those two sample chapters. No production update authorized.

## Phase 14 — source-only XI checkpoint chain (not signed tariff data)

Every managed XI shard's merged raw commodity database now produces an
independently replayed checkpoint continuity receipt. It records hashes
of the exact frozen catalogue, previous cumulative checkpoint and
previous receipt, new merged SQLite, and source audit manifest.
Previously successful raw responses must remain unchanged between
batches, and previously failed requests may only be replaced by verified
successes; deleted or altered history blocks acceptance.

CI also checks that a forged root report or divergent receipt cannot
silently replace earlier evidence. All source-only records retain
production_eligible=false, ni_other_verified=false,
atomic_official_snapshot_verified=false and
chain_authenticated_or_signed=false. A hash chain by itself is NOT
a digital signature or proof of official HMRC transaction atomicity.

The first real public two-chapter canary produced a verified partial
source-only root with five successful commodity responses and 511
uncollected codes. It is NOT an authenticated managed 97-chapter
production dataset. Managed later-run continuity has fixture tests
but is still awaiting an authorized live source run.

No version in this chain is an importable desktop tariff snapshot;
do not write any values into Other, north_ireland_rate, or tariffs.db.
Official-source document: cursor-tax-tools/docs/xi-checkpoint-continuity.md

## Phase 15 — signed portable NI *raw source* archives are NOT desktop tariff packs

The producer can package a pinned original XI commodity catalogue, frozen
source manifest, replay-verified raw-measure SQLite, merged evidence report
and current+immediate-parent checkpoint chain in a fixed-member ZIP.

Managed-full packages require an **operator Ed25519 signature**, verified
at restore time against an independently trusted public key. Restore
rejects member tampering, missing/extra data, path traversal, symlinks,
unsigned managed archives and incomplete source replay. The signing
private key never belongs in this repository or any app-installed file.

A successful restore only proves the operator's signed raw source archive
can be rechecked; it does NOT prove HMRC atomic source consistency,
origin-specific NI `Other` duty, legal payable rate, or a customer data
publication signature. Public XI canary archives are deliberately unsigned
and CANNOT be treated as managed-full sources.

All source archive receipts retain `production_eligible=false`,
`ni_other_verified=false`, and `atomic_official_snapshot_verified=false`.
**No desktop importer, `tariffs.db` migration, `north_ireland_rate` or
`other_rate` update may consume these review artifacts** until separate
legal/rate business certification and signed production packaging exist.

GitHub Actions archive retention remains time limited (~30 days):
an external encrypted/versioned object store and secure key custody are
still needed. An operator signature alone is not durable storage.

See producer `docs/xi-signed-source-archive.md`.

## Phase 16 — protected NI source archive in S3 (NOT desktop-rate distribution)

The producer now has a review-only Amazon S3 vault adapter for a previously
operator-signed XI managed checkpoint ZIP. It requires S3 versioning,
SSE-KMS with an exact approved KMS key, COMPLIANCE Object Lock and
content-addressed keys with conditional (`If-None-Match`) upload.

After storage it verifies exact VersionId, bucket owner, file size, KMS
and retention metadata, re-downloads the SAME pinned object version,
checks its full SHA-256 and independently restores the operator Ed25519
signed archive plus all original HMRC raw response/parent-chain proofs.
A standalone CLI can repeat this recovery using a retained S3 version
receipt even after 30-day GitHub Actions artifacts expire.

**Do not claim deployment:** the real AWS role, bucket, KMS permissions
and managed HMRC signing credentials have not been connected/tested in
the current development phase. Mocked S3 recovery tests do not mean
external backups are live. The managed-only workflow now uses GitHub
OIDC temporary AWS credentials and requests 365 days Object Lock.

The S3 version receipt must also be preserved externally, not only
in expiring Actions artifact storage. Independent cross-region/account
replication and restore drills are future operational acceptance.

These artifacts remain `production_eligible=false`,
`ni_other_verified=false`, `atomic_official_snapshot_verified=false`.
They MUST NOT be imported as `tariffs.db` or used to populate
`north_ireland_rate` / `other_rate` without separate NI tax business
certification and consumer publication signature.

Producer runbook: cursor-tax-tools/docs/xi-s3-immutable-vault.md

## Data-first GB v4.0.1627 completeness and consumer query contract

GB upstream source v4.0.1627 has now been **actually downloaded** and
compared to v4.0.1626 at the same 2026-10-14 as-of. Full expanded source
has 1,123,765 measures, 16,742 active leaf goods, 16,376 type-103
geography-1011 active target candidate codes and 16,560 103/1011
candidate evidence records across dates. The previous/current diff
found ZERO source candidate changes, losses or active leaf additions.

BUT 359 active leaf goods have only non-GB geography-1080 context in
the target review and 7 special goods lack any expanded measures;
these 366 are explicitly unresolved. No inference of `0%` is allowed.

Producer `gb_source_ledger.py` outputs a **complete one-row-per-active
commodity CSV**, preserves compound duty expressions, conditions,
exclusions, additional codes, start/end dates and statuses, and offers
read-only JSON lookup for an exact 10-digit commodity code. Every
result has no certified payable rate, preserves the raw evidence, and
never substitutes the Channel Islands 1080 geography for GB 1011.

**Desktop consumer must not import this as a production `tariffs.db`:**
before exposing the rates as payable, resolve 366 unknowns and
origin-/condition-specific duty applicability; separately verify
NI full managed coverage and legacy UI Other semantics. Until then
existing installed data remains unchanged and unknown must be shown
as unknown, not silently mapped to 0%. This is an ingestion and QA
contract, NOT executable desktop code or a certified tariff release.

Producer implementation and acceptance:
cursor-tax-tools/docs/data-first-gb-xi-readiness.md
