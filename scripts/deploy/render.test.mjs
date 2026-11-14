import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployRender } from './render.mjs';
const env = { RENDER_API_KEY: 'test-secret', RENDER_SERVICE_ID: 'srv-test', API_IMAGE: `ghcr.io/heartzz/dealse-api@sha256:${'a'.repeat(64)}`, DEALSE_API_URL: 'https://api.example.com' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('deploys a digest, waits for live, and never sends Render credentials to the app', async () => {
  const calls = [];
  const responses = [json({ id: 'dep-test' }), json({ status: 'update_in_progress' }), json({ status: 'live' }), json({ status: 'ok' })];
  await deployRender(env, { fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return responses.shift(); }, sleep: async () => {} });
  assert.deepEqual(JSON.parse(calls[0].init.body), { imageUrl: env.API_IMAGE });
  assert.equal(calls[3].url, 'https://api.example.com/api/v1/health');
  assert.equal(calls[3].init.headers, undefined);
});
test('failed Render rollout stops before health or website deployment', async () => {
  const responses = [json({ id: 'dep-test' }), json({ status: 'update_failed' })];
  await assert.rejects(deployRender(env, { fetchImpl: async () => responses.shift() }), /update_failed/);
  assert.equal(responses.length, 0);
});
test('missing config and mutable image tags fail before network access', async () => {
  const fetchImpl = () => assert.fail('must not send request');
  await assert.rejects(deployRender({ ...env, RENDER_API_KEY: '' }, { fetchImpl }), /Missing RENDER_API_KEY/);
  await assert.rejects(deployRender({ ...env, API_IMAGE: 'ghcr.io/heartzz/dealse-api:latest' }, { fetchImpl }), /immutable/);
});
test('provider error body is not disclosed and deployment POST is not retried', async () => {
  let requests = 0;
  await assert.rejects(deployRender(env, { fetchImpl: async () => { requests++; return json({ secret: 'do-not-print' }, 401); } }), (error) => error.message.includes('401') && !error.message.includes('do-not-print'));
  assert.equal(requests, 1);
});
test('bounded polling fails when deployment never becomes live', async () => {
  let requests = 0;
  await assert.rejects(deployRender(env, { attempts: 2, sleep: async () => {}, fetchImpl: async () => json(requests++ === 0 ? { id: 'dep-test' } : { status: 'update_in_progress' }) }), /Timed out/);
  assert.equal(requests, 3);
});
test('unhealthy live service fails the release', async () => {
  const responses = [json({ id: 'dep-test' }), json({ status: 'live' }), json({}, 503)];
  await assert.rejects(deployRender(env, { fetchImpl: async () => responses.shift() }), /health check returned HTTP 503/);
});
