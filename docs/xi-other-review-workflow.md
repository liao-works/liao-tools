# Northern Ireland "Other" — review-only workflow

**Scope:** candidate XI measures for type `103` / ERGA OMNES `1011`,
NOT an authoritative mapping of the rendered tariff page's **Other** row.

## Reproduce the audit

In [cursor-tax-tools PR #6](https://github.com/liao-works/cursor-tax-tools/pull/6),
open the most recent green **Focused third-country duty tests** workflow run
and download `xi-stratified-review-<run_id>`.

Extract the GitHub Actions artifact ZIP. It contains:
- `xi-audit.json`: individual HMRC XI candidate source details, sample as-of
  date, effective-date checks and canonical response fingerprints.
- `xi-review-gate.json`: chapter-coverage summary plus prioritized manual
  review items and the SHA-256 of the exact `xi-audit.json` bytes.
- `xi-review-gate.md`: readable review checklist.

In **Liao Tools > Tariff > Data update > NI Other · 证据审核**,
select `xi-review-gate.json` (not the Actions outer ZIP).
The app validates the schema, count, date, source digest format and safety flags,
then shows each priority item's old NI value, candidate expression, reason for
review and link to the official XI tariff page.

**No duty is imported.** This feature never overwrites `tariffs.db`, updates
provenance statuses, or merges candidate rates into main queries/Excel.

## What the report proves — and what it does not

The evidence file itself is **unsigned**. The stored SHA-256 links the summary
to the downloaded detailed audit; it does not authenticate the producer.
A valid hash and a successful review gate mean the samples were processed
consistently. They do not mean HMRC defines the page's `Other` rate as a
universal 103/1011 rule.

NI `Other` rules require representative commodity/category/condition analysis
and human validation. The reviewed sample intentionally remains
`production_eligible=false` and `other_semantics_verified=false` even
when source candidates equal legacy values.

## Checklist before a production decision

1. Validate sample references and effective dates independently.
2. Confirm complex expressions retain currencies and physical units.
3. Investigate additional-code measures, condition cases, missing measures,
   historical-only codes and geographic exclusions.
4. Compare the tariff service's displayed **Other** row to the machine-readable
   candidate where its UI meaning is unambiguous.
5. Expand beyond 24 chapter samples; repeat offset-based rounds and maintain
   a documented dispute/discrepancy register.
6. Require a separately authenticated release signing chain, rollback and
   explicit change approval. A signed **review-only** envelope is not a
   production authorization.

Desktop branch remains Draft PR #1. Producer branch remains Draft PR #6.
