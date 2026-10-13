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

## Signed review extension (2026-10-13)

The signing protocol is **not** a production release and cannot be silently
installed. It authenticates a source-signed shadow manifest with the **public
key pinned at build time**, then verifies its SQLite digest and quality gates.

**Build-time pinning:** The build environment must specify
`TAX_V2_TRUSTED_PUBLIC_KEY_HEX` as a 64-character hex string encoding the
32-byte Ed25519 public key corresponding to the source Actions secret. No
key is downloaded from ZIP or remotely fetched. Without this setting the
verification UI is absent and the backend fails closed.

Example on PowerShell (public key only; this is not a private secret):
```powershell
$env:TAX_V2_TRUSTED_PUBLIC_KEY_HEX = "<64-hex-character-public-key>"
pnpm tauri build
```

1. In `cursor-tax-tools`, configure GitHub Actions secret
   `TAX_V2_ED25519_PRIVATE_SEED_HEX`. **Never commit any private seed.**
2. Execute the manual workflow `Signed target duty review (manual, no release)`.
   Extract `target-duty-signed-review.zip` from its Actions artifact.
3. In the desktop app built with the corresponding pinned public key, use
   **签名审计包验证（非生产）** to inspect it. The UI must display the
   signing key ID, version, coverage, and a "not production" warning.
4. Tamper with any manifest byte, signature byte or database byte: verification
   must fail. Change `production_eligible` to `true`: signature check or
   channel gate must reject it. Missing public key must also reject.
5. Verify the current production database and preview query still work
   independently. The command `tax_verify_signed_review` **never writes**
   to any database or switches version pointers.

A valid signature is not legal/semantic verification of `Other` applicability.
The manual review protocol intentionally **cannot authorize** a production
release. Key rotation/revocation and monotonic version gating must be designed
before a separate production signature protocol is activated.
