import { handle } from 'hono/vercel';
import app from '../server/app.ts';

export const runtime = 'nodejs';
/** Vercel Pro / Fluid — long agentic SSE runs with revision rounds. */
export const maxDuration = 800;

export default handle(app);
