import { Hono } from "hono";
import { a as apiJsonError } from "../[[...route]].js";
import { g as getProvider, a as getAvailableProviders } from "./registry-B7is6TUr.js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
import "zod";
import "./openrouter-budget-B6nu86e7.js";
import "./model-capabilities--LonKxeT.js";
const models = new Hono();
models.get("/:provider", async (c) => {
  const providerId = c.req.param("provider");
  const provider = getProvider(providerId);
  if (!provider) {
    return apiJsonError(c, 404, `Unknown provider: ${providerId}`);
  }
  const modelList = await provider.listModels();
  return c.json(modelList);
});
models.get("/", async (c) => {
  const providers = getAvailableProviders();
  return c.json(providers.map((p) => ({ id: p.id, name: p.name, description: p.description })));
});
export {
  models as default
};
