import { Hono } from 'hono';
import { OpenRouterBudgetStatusResponseSchema } from '../../src/api/wire-schemas.ts';
import { getOpenRouterBudgetStatus } from '../services/openrouter-budget-status.ts';

const providerStatus = new Hono();

providerStatus.get('/openrouter', async (c) => {
  const status = await getOpenRouterBudgetStatus();
  return c.json(OpenRouterBudgetStatusResponseSchema.parse(status));
});

export default providerStatus;
