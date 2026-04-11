import { Hono } from 'hono';
import { apiJsonError } from '../lib/api-json-error.ts';
import { getProvider, getAvailableProviders } from '../services/providers/registry.ts';

const models = new Hono();

models.get('/:provider', async (c) => {
  const providerId = c.req.param('provider');
  const provider = getProvider(providerId);
  if (!provider) {
    return apiJsonError(c, 404, `Unknown provider: ${providerId}`);
  }

  const modelList = await provider.listModels();
  return c.json(modelList);
});

models.get('/', async (c) => {
  const providers = getAvailableProviders();
  return c.json(providers.map((p) => ({ id: p.id, name: p.name, description: p.description })));
});

export default models;
