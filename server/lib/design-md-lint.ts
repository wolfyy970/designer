import type { DesignMdLintFinding, DesignMdLintSummary } from '../../src/types/workspace-domain.ts';

type GoogleDesignMdFinding = {
  severity?: unknown;
  message?: unknown;
};

type GoogleDesignMdReport = {
  findings?: GoogleDesignMdFinding[];
  summary?: {
    errors?: unknown;
    warnings?: unknown;
    infos?: unknown;
  };
};

function asSeverity(value: unknown): DesignMdLintFinding['severity'] {
  return value === 'error' || value === 'warning' || value === 'info' ? value : 'info';
}

function normalizeLintReport(report: GoogleDesignMdReport): DesignMdLintSummary {
  const findings =
    report.findings?.map((finding) => ({
      severity: asSeverity(finding.severity),
      message: typeof finding.message === 'string' ? finding.message : 'Unknown DESIGN.md lint finding',
    })) ?? [];
  const counted = {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  };
  return {
    errors: typeof report.summary?.errors === 'number' ? report.summary.errors : counted.errors,
    warnings: typeof report.summary?.warnings === 'number' ? report.summary.warnings : counted.warnings,
    infos: typeof report.summary?.infos === 'number' ? report.summary.infos : counted.infos,
    findings,
  };
}

export async function lintDesignMdDocument(content: string): Promise<DesignMdLintSummary> {
  const mod = (await import('@google/design.md/linter')) as {
    lint: (input: string) => GoogleDesignMdReport;
  };
  return normalizeLintReport(mod.lint(content));
}

