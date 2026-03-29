/**
 * Agent Skills catalog XML for system prompts (aligned with Pi / agentskills.io integrate-skills).
 * Adapted from @mariozechner/pi-coding-agent dist/core/skills.js (MIT).
 */

export interface SkillPromptDescriptor {
  name: string;
  description: string;
  /** Virtual path inside the PI workspace (e.g. skills/my-skill/SKILL.md). */
  location: string;
  /** When true, omit from automatic catalog (manual injection only). */
  disableModelInvocation?: boolean;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format skills for inclusion in a system prompt (tier-1 progressive disclosure).
 */
export function formatSkillsForPrompt(skills: SkillPromptDescriptor[]): string {
  const visible = skills.filter((s) => !s.disableModelInvocation);
  if (visible.length === 0) {
    return '';
  }
  const lines = [
    '\n\nThe following skills provide specialized instructions for specific tasks.',
    'Use the read_file tool to load a skill file when the task matches its description.',
    'When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that path with read_file.',
    '',
    '<available_skills>',
  ];
  for (const skill of visible) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.location)}</location>`);
    lines.push('  </skill>');
  }
  lines.push('</available_skills>');
  return lines.join('\n');
}
