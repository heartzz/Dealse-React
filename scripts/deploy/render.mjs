import { pathToFileURL } from 'node:url';

export async function deployRender(env, { fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 90 } = {}) {
  for (const name of ['RENDER_API_KEY', 'RENDER_SERVICE_ID', 'API_IMAGE', 'DEPLOY_COMMIT_SHA', 'DEALSE_API_URL']) {
    if (!env[name]) throw new Error(`Missing ${name}. See docs/deployment.md.`);
  }
  if (!/^srv-[a-z0-9]+$/.test(env.RENDER_SERVICE_ID)) throw new Error('Invalid RENDER_SERVICE_ID.');
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(env.API_IMAGE)) throw new Error('API_IMAGE must be an immutable GHCR digest.');
  if (!/^[a-f0-9]{40}$/i.test(env.DEPLOY_COMMIT_SHA)) throw new Error('DEPLOY_COMMIT_SHA must be a full commit SHA.');
  const origin = new URL(env.DEALSE_API_URL);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('DEALSE_API_URL must be an HTTPS origin without credentials or a path.');
  }
  const serviceUrl = `https://api.render.com/v1/services/${env.RENDER_SERVICE_ID}`;
  const deploysUrl = `${serviceUrl}/deploys`;
  async function request(url, init = {}) {
    const method = init.method ?? 'GET';
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${env.RENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const code = typeof errorBody?.code === 'string' ? errorBody.code : null;
      const message = typeof errorBody?.message === 'string' ? errorBody.message : null;
      const safe = (value) => value
        .replaceAll(env.RENDER_API_KEY, '[redacted]')
        .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, 500);
      const details = [code && `code=${safe(code)}`, message && `message=${safe(message)}`].filter(Boolean).join('; ');
      const path = new URL(url).pathname;
      throw new Error(`Render API ${method} ${path} returned HTTP ${response.status}${details ? ` (${details})` : ''}.`);
    }
    return response.json();
  }
  const serviceResponse = await request(serviceUrl);
  const service = serviceResponse.service ?? serviceResponse;
  const imageBacked = typeof service.imagePath === 'string' && service.imagePath.length > 0;
  const gitBacked = typeof service.repo === 'string' && service.repo.length > 0 || typeof service.buildSourceId === 'string' && service.buildSourceId.length > 0;
  if (!imageBacked && !gitBacked) throw new Error('Render service source could not be identified; refusing to create a deployment.');

  // Render accepts imageUrl only for image-backed services. Git-backed services deploy a commit instead.
  const deployPayload = imageBacked ? { imageUrl: env.API_IMAGE } : { commitId: env.DEPLOY_COMMIT_SHA };
  // Do not retry this POST: an ambiguous network failure may already have created a deploy.
  const deployment = await request(deploysUrl, { method: 'POST', body: JSON.stringify(deployPayload) });
  if (!/^dep-[a-z0-9]+$/.test(deployment.id ?? '')) throw new Error('Render did not return a deployment ID. Check the dashboard before retrying.');
  const failed = new Set(['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated']);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await request(`${deploysUrl}/${deployment.id}`);
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
