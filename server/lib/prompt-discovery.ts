/**
 * Reads system prompts from `prompts/{name}/PROMPT.md` on disk.
 * Same caching pattern as skill discovery.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const promptFrontmatterSchema = z.object({
  name: z.string().min(1),
  type: z.literal('system-prompt'),
  description: z.string().min(1),
});

const cache = new Map<string, string>();

function resolvePromptsRoot(): string {
  const fromEnv = process.env.PROMPTS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'prompts');
}

function splitPromptMarkdown(raw: string): { frontmatterYaml: string; body: string } | null {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const frontmatterYaml = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { frontmatterYaml, body };
}

export async function getSystemPromptBody(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const promptsRoot = resolvePromptsRoot();
  const filePath = path.join(promptsRoot, name, 'PROMPT.md');
  const raw = await fs.readFile(filePath, 'utf8');
  const split = splitPromptMarkdown(raw);
  if (!split) throw new Error(`Invalid PROMPT.md frontmatter in ${filePath}`);

  let data: unknown;
  try {
    data = parseYaml(split.frontmatterYaml);
  } catch {
    throw new Error(`Invalid YAML in ${filePath}`);
  }
  const parsed = promptFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid frontmatter schema in ${filePath}: ${parsed.error.message}`);
  }

  cache.set(name, split.body);
  return split.body;
}

export function clearPromptCache(): void {
  cache.clear();
}
