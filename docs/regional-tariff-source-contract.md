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
