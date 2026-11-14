// Creates an identity fixture only in the disposable loopback CI database.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.CI !== 'true' || process.env.NODE_ENV === 'production' || url.pathname !== '/dealse_dev' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
  throw new Error('Retailer fixture requires CI=true and a disposable loopback dealse_dev database.');
}
const client = new Client({ connectionString: url.href });
try {
  await client.connect();
  await client.query('BEGIN');
  const result = await client.query(`INSERT INTO users (id, auth_provider, auth_subject, status, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, $2, 'active', now(), now())
    ON CONFLICT (auth_provider, auth_subject) DO UPDATE SET updated_at = now() RETURNING id`, ['ci-fixture', 'public-catalogue-owner']);
  await client.query('INSERT INTO user_account_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING', [result.rows[0].id, 'retailer']);
  await client.query('COMMIT');
} finally {
  await client.end();
}
