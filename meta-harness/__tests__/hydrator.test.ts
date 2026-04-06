import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GENERATION_MODE } from '../../src/constants/generation.ts';
import {
  hydrateIncubateRequest,
  hydrateIncubateRequestFromParsed,
  hydrateMetaHarnessTestCase,
  hydrateMetaHarnessTestCaseFromParsed,
  MH_HYPOTHESIS_NODE,
  MH_MODEL_NODE,
  SimplifiedMetaHarnessTestCaseSchema,
} from '../test-case-hydrator.ts';
import type { HypothesisStrategy } from '../../src/types/incubator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('meta-harness test-case-hydrator', () => {
  it('hydrates landing-page-saas.json', async () => {
    const raw = JSON.parse(
      await readFile(path.join(__dirname, '../test-cases/landing-page-saas.json'), 'utf8'),
    ) as unknown;
    const body = hydrateMetaHarnessTestCase(raw, { defaultIncubatorProvider: 'openrouter' });
    expect(body.hypothesisNodeId).toBe(MH_HYPOTHESIS_NODE);
    expect(body.domainHypothesis?.agentMode).toBe(GENERATION_MODE.AGENTIC);
    expect(body.modelProfiles[MH_MODEL_NODE]?.modelId).toContain('minimax');
    expect(body.strategy.hypothesis.length).toBeGreaterThan(20);
    expect(body.spec.sections['design-brief']?.content).toContain('Northstar');
  });

  it('merges extra section keys into design-brief', async () => {
    const raw = {
      name: 'x',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'brief only',
          'custom-notes': 'extra block',
        },
      },
      strategy: {
        id: 's1',
        name: 'S',
        hypothesis: 'h',
        rationale: 'r',
        measurements: 'm',
        dimensionValues: { format: 'html' },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
    };
    const body = hydrateMetaHarnessTestCase(raw, { defaultIncubatorProvider: 'openrouter' });
    expect(body.spec.sections['design-brief']?.content).toContain('custom-notes');
    expect(body.spec.sections['design-brief']?.content).toContain('extra block');
  });

  it('hydrateIncubateRequest builds incubate body with promptOptions.count', () => {
    const raw = {
      name: 'c1',
      spec: {
        title: 'T',
        sections: { 'design-brief': 'brief', 'existing-design': '', 'research-context': '', 'objectives-metrics': '', 'design-constraints': '' },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
      incubate: { hypothesisCount: 3 },
    };
    const body = hydrateIncubateRequest(raw, {
      incubateProvider: 'openrouter',
      incubateModel: 'a/b',
      defaultHypothesisCount: 99,
    });
    expect(body.providerId).toBe('openrouter');
    expect(body.modelId).toBe('a/b');
    expect(body.promptOptions).toEqual({ count: 3 });
    expect(body.spec).toBeDefined();
    expect(typeof (body.spec as { title: string }).title).toBe('string');
  });

  it('hydrateMetaHarnessTestCase uses strategyOverride', () => {
    const override: HypothesisStrategy = {
      id: 'picked-1',
      name: 'Picked',
      hypothesis: 'H',
      rationale: 'R',
      measurements: 'M',
      dimensionValues: { format: 'static-html' },
    };
    const raw = {
      name: 'x',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'b',
          'existing-design': '',
          'research-context': '',
          'objectives-metrics': '',
          'design-constraints': '',
        },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
    };
    const body = hydrateMetaHarnessTestCase(raw, {
      defaultIncubatorProvider: 'openrouter',
      strategyOverride: override,
    });
    expect(body.strategy.id).toBe('picked-1');
    expect(body.domainHypothesis?.strategyId).toBe('picked-1');
  });

  it('FromParsed helpers match parse-then-hydrate', () => {
    const raw = {
      name: 'x',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'b',
          'existing-design': '',
          'research-context': '',
          'objectives-metrics': '',
          'design-constraints': '',
        },
      },
      strategy: {
        id: 's1',
        name: 'S',
        hypothesis: 'h',
        rationale: 'r',
        measurements: 'm',
        dimensionValues: { format: 'html' },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
      incubate: { hypothesisCount: 2 },
    };
    const parsed = SimplifiedMetaHarnessTestCaseSchema.parse(raw);
    const incubateA = hydrateIncubateRequestFromParsed(parsed, { incubateProvider: 'p', incubateModel: 'm' });
    const incubateB = hydrateIncubateRequest(raw, { incubateProvider: 'p', incubateModel: 'm' });
    expect(incubateA.promptOptions).toEqual(incubateB.promptOptions);
    expect(incubateA.providerId).toBe(incubateB.providerId);
    expect(incubateA.modelId).toBe(incubateB.modelId);
    expect((incubateA.spec as { title: string }).title).toBe((incubateB.spec as { title: string }).title);

    const hypA = hydrateMetaHarnessTestCaseFromParsed(parsed, { defaultIncubatorProvider: 'openrouter' });
    const hypB = hydrateMetaHarnessTestCase(raw, { defaultIncubatorProvider: 'openrouter' });
    expect(hypA.strategy).toEqual(hypB.strategy);
    expect(hypA.modelProfiles).toEqual(hypB.modelProfiles);
    expect(hypA.spec.title).toBe(hypB.spec.title);
    expect(hypA.hypothesisNodeId).toBe(hypB.hypothesisNodeId);
  });

  it('hydrateMetaHarnessTestCase requires strategy when no override', () => {
    const raw = {
      name: 'x',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'b',
          'existing-design': '',
          'research-context': '',
          'objectives-metrics': '',
          'design-constraints': '',
        },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
    };
    expect(() => hydrateMetaHarnessTestCase(raw, { defaultIncubatorProvider: 'openrouter' })).toThrow(
      /strategy/,
    );
  });
});
