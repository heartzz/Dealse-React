import { pathToFileURL } from 'node:url';

export async function deployRender(env, { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 90 } = {}) {
  for (const name of ['RENDER_API_KEY', 'RENDER_SERVICE_ID', 'API_IMAGE', 'DEALSE_API_URL']) {
    if (!env[name]) throw new Error(`Missing ${name}. See docs/deployment.md.`);
  }
  if (!/^srv-[a-z0-9]+$/.test(env.RENDER_SERVICE_ID)) throw new Error('Invalid RENDER_SERVICE_ID.');
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(env.API_IMAGE)) throw new Error('API_IMAGE must be an immutable GHCR digest.');
  const origin = new URL(env.DEALSE_API_URL);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('DEALSE_API_URL must be an HTTPS origin without credentials or a path.');
  }
  const base = `https://api.render.com/v1/services/${env.RENDER_SERVICE_ID}/deploys`;
  async function request(url, init = {}) {
    const response = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${env.RENDER_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    // Never print response bodies: provider errors may contain configuration values.
    if (!response.ok) throw new Error(`Render API returned HTTP ${response.status}. Check Render's dashboard.`);
    return response.json();
  }
  // Do not retry this POST: an ambiguous network failure may already have created a deploy.
  const deployment = await request(base, { method: 'POST', body: JSON.stringify({ imageUrl: env.API_IMAGE }) });
  if (!/^dep-[a-z0-9]+$/.test(deployment.id ?? '')) throw new Error('Render did not return a deployment ID. Check the dashboard before retrying.');
  const failed = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated']);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await request(`${base}/${deployment.id}`);
    if (failed.has(current.status)) throw new Error(`Render deployment ended with ${current.status}. Website deployment stopped.`);
    if (current.status === 'live') {
      const health = await fetchImpl(new URL('/api/v1/health', origin), { signal: AbortSignal.timeout(60_000), redirect: 'error' });
      if (!health.ok) throw new Error(`API health check returned HTTP ${health.status}. Website deployment stopped.`);
      return deployment.id;
    }
    await sleep(10_000);
  }
  throw new Error('Timed out waiting for Render. Check its dashboard before retrying.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await deployRender(process.env);
    console.log('Render deployment is live and API health check passed.');
  } catch (error) {
    // Avoid dumping fetch errors with URLs/headers or environment contents.
    console.error(error instanceof TypeError ? 'Deployment request failed. Check connectivity and Render dashboard.' : error.message);
    process.exitCode = 1;
  }
}
