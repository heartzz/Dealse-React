import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ENV = path.join(ROOT, "apps", "api", ".env");
const TARGET_ENV = path.join(ROOT, ".env.deploy.local");
const EXPECTED_TARGET = {
  host: "dealse-staging-pg-dealse-staging.h.aivencloud.com",
  port: 19206,
  database: "defaultdb",
};
const DEFAULT_CA_PATH = "C:/Users/DELL/Downloads/ca.pem";

const TABLES = [
  "users",
  "user_account_roles",
  "admin_accounts",
  "admin_permission_grants",
  "admin_invitations",
  "admin_bootstrap",
  "user_profiles",
  "retailers",
  "retailer_memberships",
  "categories",
  "stores",
  "products",
  "media_assets",
  "store_images",
  "product_images",
  "deals",
  "deal_reports",
  "deal_products",
  "deal_images",
  "favourites",
  "followed_stores",
  "notifications",
  "redemption_codes",
  "redemptions",
  "audit_logs",
];

// Source snapshot from the read-only audit. Any change requires a fresh audit.
const EXPECTED_SOURCE_COUNTS = {
  users: 6,
  user_account_roles: 11,
  admin_accounts: 1,
  admin_permission_grants: 0,
  admin_invitations: 2,
  admin_bootstrap: 1,
  user_profiles: 6,
  retailers: 14,
  retailer_memberships: 14,
  categories: 11,
  stores: 14,
  products: 20,
  media_assets: 3,
  store_images: 0,
  product_images: 0,
  deals: 27,
  deal_reports: 0,
  deal_products: 22,
  deal_images: 2,
  favourites: 3,
  followed_stores: 2,
  notifications: 5,
  redemption_codes: 26,
  redemptions: 2,
  audit_logs: 90,
};

const EXPECTED_TARGET_COUNTS = Object.fromEntries(TABLES.map((table) => [table, table === "categories" ? 9 : 0]));
const EXCLUDED_TABLES = new Set(["redemption_codes", "redemptions"]);
const EXPECTED_SOURCE_CATEGORY_SLUGS = [
  "beauty-wellness",
  "books-stationery",
  "electronics",
  "fashion-accessories",
  "food-beverages",
  "footwear",
  "gifts-handicrafts",
  "grocery-supermarket",
  "home-living",
  "pets-pet-care",
  "sports-fitness",
].sort();
const EXPECTED_TARGET_CATEGORY_SLUGS = EXPECTED_SOURCE_CATEGORY_SLUGS.filter(
  (slug) => !["footwear", "grocery-supermarket"].includes(slug),
).sort();

function parseEnvFile(filePath) {
  const values = new Map();
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function parseDatabaseUrl(value, label) {
  if (!value) throw new Error(`${label} DATABASE_URL is missing or blank.`);
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} DATABASE_URL is invalid.`);
  }
}

function safeEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function safeError(error) {
  const code = typeof error?.code === "string" ? error.code : "unknown";
  const message = typeof error?.message === "string" ? error.message : "Unexpected failure.";
  return `${code}: ${message.replace(/(?:postgres(?:ql)?|postgres):\/\/\S+/gi, "[connection string redacted]")}`;
}

async function connectFromUrl(url, ssl) {
  const client = new Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl,
    connectionTimeoutMillis: 15_000,
    application_name: "dealse-local-to-aiven-data-import",
  });
  await client.connect();
  return client;
}

async function beginSnapshot(client, writable) {
  await client.query(writable ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SET LOCAL lock_timeout = '10s'");
}

async function readCounts(client) {
  const counts = {};
  for (const table of TABLES) {
    const result = await client.query("SELECT to_regclass($1) IS NOT NULL AS relation_exists", [`public.${table}`]);
    if (!result.rows[0].relation_exists) throw new Error(`Required table public.${table} is missing.`);
    const count = await client.query(`SELECT count(*)::bigint AS count FROM public.${quoteIdentifier(table)}`);
    counts[table] = Number(count.rows[0].count);
  }
  return counts;
}

function assertCounts(actual, expected, label) {
  const differences = TABLES
    .filter((table) => actual[table] !== expected[table])
    .map((table) => `${table}: expected ${expected[table]}, found ${actual[table]}`);
  if (differences.length) throw new Error(`${label} counts changed; refusing to continue. ${differences.join("; ")}`);
}

async function readSchema(client) {
  const columns = (await client.query(
    `SELECT table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [TABLES],
  )).rows.map((row) => Object.values(row));

  const foreignKeys = (await client.query(
    `SELECT child.relname AS table_name, con.conname AS constraint_name,
            ca.attname AS column_name, parent.relname AS ref_table,
            pa.attname AS ref_column, con.confdeltype, con.confupdtype,
            ck.ord AS column_order
     FROM pg_constraint con
     JOIN pg_class child ON child.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = child.relnamespace
     JOIN pg_class parent ON parent.oid = con.confrelid
     CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY ck(attnum, ord)
     CROSS JOIN LATERAL unnest(con.confkey) WITH ORDINALITY pk(attnum, ord)
     JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = ck.attnum
     JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = pk.attnum AND pk.ord = ck.ord
     WHERE con.contype = 'f' AND ns.nspname = 'public' AND child.relname = ANY($1::text[])
     ORDER BY child.relname, con.conname, ck.ord`,
    [TABLES],
  )).rows.map((row) => Object.values(row));

  const uniqueConstraints = (await client.query(
    `SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
            kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = ANY($1::text[])
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`,
    [TABLES],
  )).rows.map((row) => Object.values(row));

  return { columns, foreignKeys, uniqueConstraints };
}

async function assertConstraintsValid(client) {
  const invalidConstraints = (await client.query(
    `SELECT conrelid::regclass::text AS relation, conname AS name
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace AND NOT convalidated
     ORDER BY conrelid::regclass::text, conname`,
  )).rows;
  const invalidIndexes = (await client.query(
    `SELECT indexrelid::regclass::text AS name
     FROM pg_index
     WHERE indrelid IN (
       SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
     ) AND (NOT indisvalid OR NOT indisready)
     ORDER BY indexrelid::regclass::text`,
  )).rows;
  if (invalidConstraints.length || invalidIndexes.length) {
    throw new Error("Destination has an unvalidated constraint or invalid index; refusing to continue.");
  }
}

async function readCategories(client) {
  return (await client.query(
    `SELECT c.id::text, c.parent_id::text, c.slug, c.name, c.sort_order, c.is_active,
            c.created_at, c.updated_at, parent.slug AS parent_slug
     FROM public.categories c
     LEFT JOIN public.categories parent ON parent.id = c.parent_id
     ORDER BY c.slug`,
  )).rows;
}

function verifyCategoryPlan(sourceCategories, targetCategories) {
  const sourceSlugs = sourceCategories.map((row) => row.slug).sort();
  const targetSlugs = targetCategories.map((row) => row.slug).sort();
  if (!safeEqual(sourceSlugs, EXPECTED_SOURCE_CATEGORY_SLUGS)) {
    throw new Error("Local category slugs differ from the audited snapshot; refusing to continue.");
  }
  if (!safeEqual(targetSlugs, EXPECTED_TARGET_CATEGORY_SLUGS)) {
    throw new Error("Aiven category slugs differ from the audited snapshot; refusing to continue.");
  }
  const targetBySlug = new Map(targetCategories.map((row) => [row.slug, row]));
  const conflicts = [];
  const missing = [];
  for (const source of sourceCategories) {
    const target = targetBySlug.get(source.slug);
    if (!target) {
      missing.push(source.slug);
      continue;
    }
    if (source.name !== target.name
      || source.sort_order !== target.sort_order
      || source.is_active !== target.is_active
      || (source.parent_slug ?? null) !== (target.parent_slug ?? null)) {
      conflicts.push(source.slug);
    }
  }
  if (conflicts.length) throw new Error(`Existing Aiven categories differ from local categories: ${conflicts.join(", ")}.`);
  if (!safeEqual(missing.sort(), ["footwear", "grocery-supermarket"])) {
    throw new Error(`Expected exactly the two audited missing categories; found ${missing.join(", ") || "none"}.`);
  }
  return { targetBySlug, missing };
}

async function insertRow(client, table, columns, row, categoryIdMap) {
  const values = columns.map((column) => {
    let value = row[column];
    if (table === "categories" && column === "updated_at" && value === null) {
      value = row.created_at;
      if (value === null || value === undefined) {
        throw new Error("A missing categories.updated_at also has no created_at fallback.");
      }
    }
    if (["stores", "products", "deals"].includes(table) && column === "category_id" && value !== null) {
      value = categoryIdMap.get(String(value));
      if (!value) throw new Error(`No category mapping exists for a ${table}.category_id value.`);
    }
    if (table === "categories" && column === "parent_id" && value !== null) {
      value = categoryIdMap.get(String(value));
      if (!value) throw new Error("No category mapping exists for a categories.parent_id value.");
    }
    return value;
  });
  const identifiers = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  await client.query(`INSERT INTO public.${quoteIdentifier(table)} (${identifiers}) VALUES (${placeholders})`, values);
}

async function transferCategories(source, target, sourceCategories, targetCategories) {
  const { targetBySlug } = verifyCategoryPlan(sourceCategories, targetCategories);
  const categoryIdMap = new Map();
  for (const row of sourceCategories) {
    const targetRow = targetBySlug.get(row.slug);
    if (targetRow) categoryIdMap.set(row.id, targetRow.id);
  }

  const missing = sourceCategories.filter((row) => !targetBySlug.has(row.slug));
  const pending = [...missing];
  let inserted = 0;
  while (pending.length) {
    const index = pending.findIndex((row) => row.parent_id === null || categoryIdMap.has(row.parent_id));
    if (index < 0) throw new Error("Missing category parent mapping or category cycle; refusing to insert categories.");
    const [row] = pending.splice(index, 1);
    const columns = Object.keys(row).filter((key) => key !== "parent_slug");
    await insertRow(target, "categories", columns, row, categoryIdMap);
    categoryIdMap.set(row.id, row.id);
    inserted += 1;
  }
  return { categoryIdMap, inserted };
}

async function copyTable(source, target, table, categoryIdMap) {
  const result = await source.query(`SELECT * FROM public.${quoteIdentifier(table)}`);
  if (result.rows.length === 0) return 0;
  const columns = result.fields.map((field) => field.name);
  for (const row of result.rows) await insertRow(target, table, columns, row, categoryIdMap);
  return result.rows.length;
}

function printReport(report) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const mode = process.argv.slice(2);
  if (mode.length !== 1 || !["--dry-run", "--apply"].includes(mode[0])) {
    throw new Error("Pass exactly one mode: --dry-run or --apply.");
  }
  const apply = mode[0] === "--apply";
  const sourceEnv = parseEnvFile(SOURCE_ENV);
  const targetEnv = parseEnvFile(TARGET_ENV);
  const sourceUrl = parseDatabaseUrl(sourceEnv.get("DATABASE_URL"), "Local source");
  const targetUrl = parseDatabaseUrl(targetEnv.get("DATABASE_URL"), "Aiven target");

  if (!["127.0.0.1", "localhost", "::1"].includes(sourceUrl.hostname)
    || decodeURIComponent(sourceUrl.pathname.slice(1)) !== "dealse_dev") {
    throw new Error("Source guard failed; expected loopback database dealse_dev.");
  }
  if (targetUrl.hostname !== EXPECTED_TARGET.host
    || Number(targetUrl.port) !== EXPECTED_TARGET.port
    || decodeURIComponent(targetUrl.pathname.slice(1)) !== EXPECTED_TARGET.database) {
    throw new Error("Destination guard failed; expected the audited Aiven staging defaultdb.");
  }

  const caPath = process.env.AIVEN_CA_CERT_PATH || DEFAULT_CA_PATH;
  if (!existsSync(caPath)) throw new Error("Aiven CA certificate file was not found; set AIVEN_CA_CERT_PATH to its local path.");
  const ca = await readFile(caPath, "utf8");
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("The configured Aiven CA file is not PEM encoded.");

  const source = await connectFromUrl(sourceUrl, false);
  const target = await connectFromUrl(targetUrl, {
    ca,
    rejectUnauthorized: true,
    servername: EXPECTED_TARGET.host,
  });
  let targetTransaction = false;
  let sourceTransaction = false;
  try {
    await beginSnapshot(source, false);
    sourceTransaction = true;
    await beginSnapshot(target, apply);
    targetTransaction = true;

    const sourceInfo = (await source.query("SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS address, version() AS version")).rows[0];
    const targetInfo = (await target.query("SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS address, version() AS version")).rows[0];
    if (sourceInfo.database !== "dealse_dev" || targetInfo.database !== "defaultdb") throw new Error("Connected database identity check failed.");
    if (targetInfo.user !== decodeURIComponent(targetUrl.username)) throw new Error("Connected Aiven database user does not match the configured URL.");

    const [sourceCounts, targetCounts] = await Promise.all([readCounts(source), readCounts(target)]);
    assertCounts(sourceCounts, EXPECTED_SOURCE_COUNTS, "Local source");
    assertCounts(targetCounts, EXPECTED_TARGET_COUNTS, "Aiven destination");

    const [sourceSchema, targetSchema] = await Promise.all([readSchema(source), readSchema(target)]);
    if (!safeEqual(sourceSchema, targetSchema)) throw new Error("Source and destination Prisma schema constraints differ; refusing to continue.");
    await Promise.all([assertConstraintsValid(source), assertConstraintsValid(target)]);

    const [sourceCategories, targetCategories] = await Promise.all([readCategories(source), readCategories(target)]);
    const categoryPlan = verifyCategoryPlan(sourceCategories, targetCategories);
    const categoryMappings = sourceCategories.map((row) => {
      const destination = categoryPlan.targetBySlug.get(row.slug);
      return {
        slug: row.slug,
        sourceId: row.id,
        destinationId: destination?.id ?? row.id,
        method: destination ? "map to preserved Aiven category by slug" : "insert missing category with source ID",
      };
    });

    const report = {
      mode: apply ? "apply (transaction will commit only after all checks pass)" : "dry-run (read-only)",
      source: {
        database: sourceInfo.database,
        user: sourceInfo.user,
        address: sourceInfo.address,
        version: sourceInfo.version.split(" ").slice(0, 2).join(" "),
        counts: sourceCounts,
      },
      destination: {
        database: targetInfo.database,
        user: targetInfo.user,
        address: targetInfo.address,
        version: targetInfo.version.split(" ").slice(0, 2).join(" "),
        beforeCounts: targetCounts,
      },
      transfer: {
        importedApplicationRows: Object.entries(sourceCounts)
          .filter(([table]) => !EXCLUDED_TABLES.has(table))
          .reduce((sum, [, count]) => sum + count, 0) - (sourceCounts.categories - categoryPlan.missing.length),
        categoriesMatchedBySlug: sourceCategories.length - categoryPlan.missing.length,
        categoriesInserted: categoryPlan.missing,
        categoryMappings,
        excludedUnchanged: Object.fromEntries([...EXCLUDED_TABLES].map((table) => [table, sourceCounts[table]])),
        categoryForeignKeysRemapped: ["stores.category_id", "products.category_id", "deals.category_id"],
        otherPrimaryKeysPreserved: true,
      },
    };

    if (!apply) {
      await target.query("ROLLBACK");
      targetTransaction = false;
      await source.query("COMMIT");
      sourceTransaction = false;
      printReport(report);
      return;
    }

    // Build the source-ID => destination-ID map before inserting rows that reference categories.
    const { categoryIdMap, inserted: categoryInsertCount } = await transferCategories(source, target, sourceCategories, targetCategories);
    if (categoryInsertCount !== categoryPlan.missing.length) throw new Error("Inserted category count differed from preflight.");

    const order = [
      "users", "user_account_roles", "user_profiles", "admin_accounts", "admin_permission_grants",
      "admin_invitations", "admin_bootstrap", "retailers", "retailer_memberships", "stores", "products",
      "media_assets", "deals", "deal_reports", "deal_products", "store_images", "product_images",
      "deal_images", "favourites", "followed_stores", "notifications", "audit_logs",
    ];
    const copied = { categories: categoryInsertCount };
    for (const table of order) copied[table] = await copyTable(source, target, table, categoryIdMap);

    // PostgreSQL constraints enforce FK and unique validity during insert; this verifies the final exact counts.
    await target.query("SET CONSTRAINTS ALL IMMEDIATE");
    await assertConstraintsValid(target);
    const finalCounts = await readCounts(target);
    const expectedFinal = { ...EXPECTED_SOURCE_COUNTS, ...Object.fromEntries([...EXCLUDED_TABLES].map((table) => [table, 0])) };
    assertCounts(finalCounts, expectedFinal, "Aiven final");

    const finalCategories = await readCategories(target);
    const finalBySlug = new Map(finalCategories.map((row) => [row.slug, row]));
    for (const sourceCategory of sourceCategories) {
      const destinationCategory = finalBySlug.get(sourceCategory.slug);
      if (!destinationCategory || destinationCategory.id !== categoryIdMap.get(sourceCategory.id)) {
        throw new Error(`Post-import category mapping failed for slug ${sourceCategory.slug}.`);
      }
    }

    report.transfer.copiedRowsByTable = copied;
    report.destination.afterCounts = finalCounts;
    await target.query("COMMIT");
    targetTransaction = false;
    await source.query("COMMIT");
    sourceTransaction = false;
    printReport(report);
  } catch (error) {
    if (targetTransaction) await target.query("ROLLBACK").catch(() => {});
    if (sourceTransaction) await source.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(`Import stopped safely: ${safeError(error)}`);
  process.exitCode = 1;
});
