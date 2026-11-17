import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployRender } from './render.mjs';
const env = { RENDER_API_KEY: 'test-secret', RENDER_SERVICE_ID: 'srv-test', API_IMAGE: `ghcr.io/heartzz/dealse-api@sha256:${'a'.repeat(64)}`, DEPLOY_COMMIT_SHA: 'b'.repeat(40), DEALSE_API_URL: 'https://api.example.com' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('deploys the exact commit for a Git-backed Docker service', async () => {
  const calls = [];
  const responses = [json({ repo: 'https://github.com/heartzz/Dealse-React', buildSourceId: 'src-test' }), json({ id: 'dep-test' }), json({ status: 'update_in_progress' }), json({ status: 'live' }), json({ status: 'ok' })];
  await deployRender(env, { fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return responses.shift(); }, sleep: async () => {} });
  assert.equal(calls[0].url, 'https://api.render.com/v1/services/srv-test');
  assert.deepEqual(JSON.parse(calls[1].init.body), { commitId: env.DEPLOY_COMMIT_SHA });
  assert.equal(calls[1].init.headers.Accept, 'application/json');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[4].url, 'https://api.example.com/api/v1/health');
  assert.equal(calls[4].init.headers, undefined);
});
test('deploys an immutable image for an image-backed service', async () => {
  const calls = [];
  const responses = [json({ imagePath: 'ghcr.io/heartzz/dealse-react-api' }), json({ id: 'dep-test' }), json({ status: 'live' }), json({ status: 'ok' })];
  await deployRender(env, { fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return responses.shift(); }, sleep: async () => {} });
  assert.deepEqual(JSON.parse(calls[1].init.body), { imageUrl: env.API_IMAGE });
});
test('failed Render rollout stops before health or website deployment', async () => {
  const responses = [json({ repo: 'https://github.com/heartzz/Dealse-React' }), json({ id: 'dep-test' }), json({ status: 'update_failed' })];
  await assert.rejects(deployRender(env, { fetchImpl: async () => responses.shift() }), /update_failed/);
  assert.equal(responses.length, 0);
});
test('missing config and mutable image tags fail before network access', async () => {
  const fetchImpl = () => assert.fail('must not send request');
  await assert.rejects(deployRender({ ...env, RENDER_API_KEY: '' }, { fetchImpl }), /Missing RENDER_API_KEY/);
  await assert.rejects(deployRender({ ...env, API_IMAGE: 'ghcr.io/heartzz/dealse-api:latest' }, { fetchImpl }), /immutable/);
  await assert.rejects(deployRender({ ...env, DEPLOY_COMMIT_SHA: 'short' }, { fetchImpl }), /full commit SHA/);
});
test('provider error code and message are reported without credentials and deployment POST is not retried', async () => {
  let requests = 0;
  const responses = [json({ imagePath: 'ghcr.io/heartzz/dealse-api' }), json({ code: 'invalid_request', message: 'bad request with test-secret and Bearer private-token' }, 400)];
  await assert.rejects(deployRender(env, { fetchImpl: async () => { requests++; return responses.shift(); } }), (error) => error.message.includes('HTTP 400') && error.message.includes('code=invalid_request') && error.message.includes('message=bad request with [redacted] and Bearer [redacted]') && !error.message.includes('test-secret') && !error.message.includes('private-token'));
  assert.equal(requests, 2);
});
test('bounded polling fails when deployment never becomes live', async () => {
  let requests = 0;
  const responses = [json({ repo: 'https://github.com/heartzz/Dealse-React' }), json({ id: 'dep-test' }), json({ status: 'update_in_progress' }), json({ status: 'update_in_progress' })];
  await assert.rejects(deployRender(env, { attempts: 2, sleep: async () => {}, fetchImpl: async () => { requests++; return responses.shift(); } }), /Timed out/);
  assert.equal(requests, 4);
});
test('unhealthy live service fails the release', async () => {
  const responses = [json({ repo: 'https://github.com/heartzz/Dealse-React' }), json({ id: 'dep-test' }), json({ status: 'live' }), json({}, 503)];
  await assert.rejects(deployRender(env, { fetchImpl: async () => responses.shift() }), /health check returned HTTP 503/);
});
