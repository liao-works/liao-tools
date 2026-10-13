# GB Third Country Duty shadow preview — manual acceptance

This feature is **not an update channel**. Preview is a separate, unsigned
auditing aid. The production tariff `tariffs.db` is untouched.

## Getting the data

1. Open [source PR #6](https://github.com/liao-works/cursor-tax-tools/pull/6)
   and the most recent green **Focused third-country duty tests** run.
2. Download Actions artifact named `gb-third-country-shadow-<run_id>`.
   GitHub gives an outer ZIP; extract it.
3. Find **`target-duty-preview.zip`** inside the outer ZIP. Do **not** choose
   the outer Actions artifact, `target-duty.db`, or legacy production Release.
4. In Liao Tools > Tariff > Data update, click
   **选择影子预览 ZIP** and select that inner file.
5. Import verifies the manifest/channel/length/digest/SQLite schema/count,
   then places a read-only comparison copy under app data
   `tax-preview/snapshots/<sha256>/target-duty.db`.
6. Look up full 10-digit HS codes, compare the production GB rate against the
   source GB candidate, and inspect **both** status labels.
   `0102291010` may have a compound duty expression; do not truncate it.

## Explicit constraints

- `signed=false` + `production_eligible=false`: these packages are deliberately
  **not** authenticated production releases; SHA-256 is not a publisher signature.
- Preview values may be `conditional`. They must not be coerced to 0%.
- NI values in preview may be `stale` or `pending` and are **not** confirmed
  XI `Other` rates. No automatic promotion or tariff declaration.
- Imports never change `tariffs.db`, latest-data releases, history or default
  data channel; importing a malformed ZIP returns an error.
- The preview is intentionally **manual**; it does not keep itself in sync.

## Windows acceptance

- Import valid shadow ZIP and compare codes with production local data.
- Import same ZIP again; content-addressed snapshot is reused safely.
- Flip one DB byte while keeping original manifest; importer must reject.
- Replace the manifest channel with `production` or set
  `production_eligible=true`; importer must reject.
- Import when offline; local compare must work.
- Check main Tariff tab, Excel query and update functions continue using
  production `tariffs.db`, never `tax-preview/snapshots`.
- Query a `conditional` GB row and ensure it is shown as ambiguous, not a
  declared numerical rate.

This preview is a controlled migration test stage. Future production promotion
requires separately pinned signing keys, immutable release URLs and sign-off
on XI/Other duty interpretation.
