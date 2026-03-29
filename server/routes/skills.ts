import { Hono } from 'hono';

const skills = new Hono();

// GET /api/skills — empty list (infrastructure for Stage 2)
skills.get('/', (c) => c.json([]));

export default skills;
