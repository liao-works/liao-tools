# Target GB Third Country / XI Other readiness (Draft PR only)

The desktop currently consumes the **production** `latest-data` Release, not
the new experimental DBT shadow artifact. The new GB target feed is **not**
eligible for production until NI selection and cross-source review are complete.

## Changes in this branch

- Detect installed database locally even without network access.
- Show the local snapshot version when remote check fails, without claiming
  "up to date"; retain offline queries.
- Download a **version-pinned** Release asset based on metadata (not a mutable
  tag binary), verify SHA-256 + size + SQLite integrity + schema + record count.
- Keep a restorable previous snapshot and metadata when installation fails.
- Individual HTML commodity requests are **read-only comparisons**; they must
  never alter the trusted offline database. They are not official verification.
- Support provenance/status fields in Rust/TS query output and Excel exports:
  `uk_rate_status`, `ni_rate_status`, source versions.
- Legacy rows with no status are visibly **unverified**, not implicitly verified.
- Excel can read numeric HS-code cells and preserve leading zeros, rejects
  fractional numeric codes, and defaults to exact, not fuzzy, HS lookup.

## Manual acceptance checklist (Windows)

1. Open installed GB/NI database while offline. Search and Excel exports must
   still work; data update page reports local version and remote unavailable.
2. Start an update while offline or on interrupted connection: old database
   remains readable.
3. Corrupt the downloaded snapshot or mismatch metadata hash: installer
   rejects it; old snapshot remains readable.
4. Compare an HS code via the single-row HTML button: no mutation to
   `tariffs.db` and user-facing label says comparison only.
5. Input HS code `0101210000` from both text and numeric Excel:
   results preserve ten digits; numeric `101210000.5` is invalid.
6. Review a shadow `conditional` row: no guessed duty, and Excel exports
   the status. Review legacy NI rows: explicitly unverified.

## Blocked production promotion

The source pipeline found 535 codes where legacy percent-only duty omits a
compound component, 375 simple percentage differences, and 512/296
legacy-only/new-only code differences. XI official V2 candidates are not
yet a verified mapping for the HTML `Other` rate. Do not merge this
PR or redirect `latest-data` until this is resolved and signed V2
snapshot promotion exists.
