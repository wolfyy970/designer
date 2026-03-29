import { Hono } from 'hono';
import { listLatestSkillVersions } from '../db/skills.ts';

const skills = new Hono();

/** GET /api/skills — latest version metadata + bodies for all skills */
skills.get('/', async (c) => {
  try {
    const rows = await listLatestSkillVersions();
    return c.json(
      rows.map((r) => ({
        key: r.skillKey,
        name: r.name,
        description: r.description,
        nodeTypes: r.nodeTypes,
        version: r.version,
        body: r.body,
        filesJson: r.filesJson,
      })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

/** GET /api/skills/:key — single skill latest version */
skills.get('/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const rows = await listLatestSkillVersions();
    const row = rows.find((r) => r.skillKey === key);
    if (!row) return c.json({ error: 'Skill not found' }, 404);
    return c.json({
      key: row.skillKey,
      name: row.name,
      description: row.description,
      nodeTypes: row.nodeTypes,
      version: row.version,
      body: row.body,
      filesJson: row.filesJson,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

export default skills;
