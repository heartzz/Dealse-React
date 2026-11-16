# Local to Aiven staging data import

This one-off importer copies the audited application rows from the loopback `dealse_dev` database to the new Aiven staging `defaultdb`. It is separate from the demo seed and migration commands. It never modifies source rows, changes the schema, uploads media, or calls Supabase.

## Required pre-import state

The importer is pinned to the read-only audit snapshot from 2026-11-16. It stops if counts, schema constraints, category slugs, destination contents, or database endpoints differ from that snapshot. Source access uses `apps/api/.env`; target access uses `.env.deploy.local`. It prints database metadata and counts only, never URLs, passwords, Auth keys, or row values.

The target TLS connection requires `C:\Users\DELL\Downloads\ca.pem` by default and verifies the certificate chain and the Aiven hostname. Set `AIVEN_CA_CERT_PATH` to the local CA file path if it is elsewhere. The URL's `sslmode=require` setting is not used as a TLS fallback; the importer supplies the CA and `rejectUnauthorized: true` explicitly.

## Import rules

- All nine existing Aiven categories remain unchanged. Source categories are matched by `slug`; their category IDs map to the preserved Aiven IDs.
- The two missing categories, `footwear` and `grocery-supermarket`, are inserted with their source IDs.
- Category `created_at` and `updated_at` values are copied from the source. If a source `updated_at` is null, the importer uses that category's `created_at`; it stops if both timestamps are null.
- Store, product, and deal category foreign keys are mapped by category slug. All other imported primary keys and foreign keys are preserved.
- `redemption_codes` and `redemptions` are counted for the preflight but never selected or inserted. The source rows remain unchanged; the expected destination counts stay zero.
- Every other Prisma application table is imported. There are no updates, deletes, truncates, seeds, or conflict-skipping clauses. Any collision or failed constraint aborts the destination transaction.
- Local media bytes are not uploaded. Imported `media_assets` rows still refer to local storage and must not be treated as available in staging.
- The source transaction is repeatable-read and read-only. The destination uses a serializable transaction. Counts and category mappings are checked before commit; errors roll back the transaction.

## Commands

Run from the repository root in PowerShell. First run only the read-only preflight:

```powershell
pnpm --filter @dealse/api exec node ../../scripts/import-local-data-to-aiven.mjs --dry-run
```

The apply command is intentionally separate and requires explicit approval of the final plan:

```powershell
pnpm --filter @dealse/api exec node ../../scripts/import-local-data-to-aiven.mjs --apply
```

Do not run `--apply` until the source, destination, counts, category mapping, excluded redemption models, and Auth/media caveats have been reviewed. If local credentials have changed, update the ignored environment files yourself before the approved command. Do not place credentials on the command line.

## Audited source counts and expected destination counts

The source snapshot contains 282 rows across the 25 Prisma models. The two excluded redemption tables account for 28 source rows. Nine destination category rows already exist and are preserved; the importer adds only the two missing category rows. Expected new destination rows are 245, and expected final application-table rows are 254 (the destination's nine existing categories plus 245 inserted rows). Redemption table counts remain zero in Aiven.

The script contains the exact per-table source and destination guards. A changed count requires a new audit and a reviewed update to that guard before import.

## Auth and media caveats

The local API/Web configuration references Supabase project `kcpuwhwcndkamycaubok`, while the historical staging reference in `infra/README.md` is `xnogtqkoynyfgmunfbwc`. In the local configured project, two of four `supabase` identity subjects matched listed Auth users; two did not. Two additional database users use the `supabase-test` provider. No Auth users are created or transferred by this importer. Recheck identity availability against the actual staging Auth project before relying on those accounts.

The two non-deleted local media object keys are present under `apps/api/.local-media/`, but the importer does not upload them or verify that they exist in staging Storage:

- `0464b8ba-0c29-49c2-b281-2bd90bd16ac4/deal/0701f92d-5ada-4e9e-bdfe-22f156de94f7.webp`
- `e12fd55e-1106-5810-a6b1-60eb85071d16/deal/8da97849-87a4-47f1-9722-e71583e8f9d0.webp`

## Post-import verification

The apply mode compares final per-table counts with the audited manifest, verifies all source category slugs resolve to their planned destination IDs, and asks PostgreSQL to check deferred constraints before commit. PostgreSQL enforces primary keys, unique constraints, and foreign keys on every insert. After commit, run a fresh read-only audit before using the imported records in the staging app.

## Execution record — 2026-11-16

The approved `--apply` command completed and committed 245 rows. Its preflight confirmed the failed prior attempt had rolled back: the destination still had only its original nine categories and no other application rows. The import preserved those nine category records, inserted the two missing categories, and left `redemption_codes` and `redemptions` untouched (zero rows in Aiven).

A separate read-only post-import verification found source-matching counts for every imported table, all 53 foreign-key constraints valid with zero orphan rows, all 27 primary-key constraints valid, the unique constraint and all 91 indexes valid, and matching primary-key sets for non-category imported records. All 11 category mappings matched the expected IDs, including source timestamps on the two inserted categories. PostgreSQL remained at 18.7 with PostGIS enabled. No seed, migration, reset, or deployment command was run as part of the import.
