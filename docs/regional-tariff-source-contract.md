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
