// packages/design-system/build-tokens.mjs
// Generates _generated-tokens.css from tokens.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(__dirname, 'tokens.json'), 'utf8'));

function isScaleStepKey(key) {
  return /^\d+$/.test(key) || key === 'subtle';
}

// Handles both nested scale steps (accent-500) and semantic flat keys (accent, fg-secondary, surface-raised)
function emitColorLightSection() {
  const lines = [];
  const colorData = tokens.color ?? {};

  for (const [scale, steps] of Object.entries(colorData)) {
    // Is the whole scale entry a flat light/dark object? (top-level key like color.surface-raised)
    if ('light' in steps && 'dark' in steps) {
      const lightVal = steps.light?.value;
      if (lightVal) lines.push(`  --color-${scale}: ${lightVal};`);
      continue;
    }

    // Otherwise it's a scale dict — iterate steps
    for (const [step, val] of Object.entries(steps)) {
      const lightVal = val?.light?.value;
      if (!lightVal) continue;

      if (step === 'base') {
        lines.push(`  --color-${scale}: ${lightVal};`);
      } else if (isScaleStepKey(step)) {
        lines.push(`  --color-${scale}-${step}: ${lightVal};`);
      } else if (step === 'raised') {
        // semantic flat key within a scale
        lines.push(`  --color-${scale}-${step}: ${lightVal};`);
      } else if (val && typeof val === 'object' && 'light' in val && 'dark' in val) {
        // other semantic flat keys (fg-secondary, fg-muted, fg-faint, etc.)
        lines.push(`  --color-${scale}-${step}: ${lightVal};`);
      }
    }
  }

  return lines;
}

function emitColorDarkSection() {
  const lines = [];
  const colorData = tokens.color ?? {};

  for (const [scale, steps] of Object.entries(colorData)) {
    if ('light' in steps && 'dark' in steps) {
      const darkVal = steps.dark?.value;
      if (darkVal) lines.push(`  --color-${scale}: ${darkVal};`);
      continue;
    }

    for (const [step, val] of Object.entries(steps)) {
      const darkVal = val?.dark?.value;
      if (!darkVal) continue;

      if (step === 'base') {
        lines.push(`  --color-${scale}: ${darkVal};`);
      } else if (isScaleStepKey(step)) {
        lines.push(`  --color-${scale}-${step}: ${darkVal};`);
      } else if (step === 'raised') {
        lines.push(`  --color-${scale}-${step}: ${darkVal};`);
      } else if (val && typeof val === 'object' && 'light' in val && 'dark' in val) {
        lines.push(`  --color-${scale}-${step}: ${darkVal};`);
      }
    }
  }

  return lines;
}

function emitSimpleSection(comment, obj, prefix) {
  const lines = [`  /* ${comment} */`];
  for (const [key, val] of Object.entries(obj ?? {})) {
    const value = typeof val === 'object' && 'value' in val ? val.value : val;
    lines.push(`  --${prefix}-${key}: ${value};`);
  }
  return lines;
}

const lightBlock = [
  '  /* color */',
  ...emitColorLightSection(),
  '',
  ...emitSimpleSection('font', tokens.font, 'font'),
  '',
  ...emitSimpleSection('text', tokens.text, 'text'),
  '',
  ...emitSimpleSection('width', tokens.width, 'width'),
  '',
  ...emitSimpleSection('min-height', tokens['min-height'], 'min-height'),
  '',
  ...emitSimpleSection('max-height', tokens['max-height'], 'max-height'),
].filter(Boolean).join('\n');

const darkBlock = [
  '  /* color */',
  ...emitColorDarkSection(),
].filter(Boolean).join('\n');

const body = `/* AUTO-GENERATED — do not edit by hand. Source: tokens.json */

:root {
${lightBlock}
}

.dark {
${darkBlock}
}
`;

const outPath = resolve(__dirname, '_generated-tokens.css');
writeFileSync(outPath, body);
console.log(`Wrote ${outPath}`);
