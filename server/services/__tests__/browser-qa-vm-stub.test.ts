import { describe, expect, it } from 'vitest';
import { runBrowserQA } from '../browser-qa-evaluator.ts';

describe('runBrowserQA VM DOM stubs', () => {
  it('allows querySelector(...).addEventListener without throwing', () => {
    const files = {
      'index.html': `<!DOCTYPE html><html><head></head><body>
        <button id="btn">Go</button>
        <script>
          document.querySelector('#btn').addEventListener('click', function () {});
          document.getElementById('btn').addEventListener('mouseenter', function () {});
        </script>
      </body></html>`,
    };
    const r = runBrowserQA({ files });
    const jsErrs = r.findings.filter((f) => f.summary === 'JS runtime error');
    expect(jsErrs).toHaveLength(0);
    expect(r.scores.js_runtime?.score ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('runs DOMContentLoaded listeners synchronously', () => {
    const files = {
      'index.html': `<!DOCTYPE html><html><head></head><body>
        <script>
          document.addEventListener('DOMContentLoaded', function () {
            document.querySelector('#x').addEventListener('click', function () {});
          });
        </script>
      </body></html>`,
    };
    const r = runBrowserQA({ files });
    expect(r.findings.filter((f) => f.summary === 'JS runtime error')).toHaveLength(0);
  });

  it('resolves relative asset paths from sub-page HTML for asset_integrity', () => {
    const files = {
      'index.html': `<!DOCTYPE html><html><head><link rel="stylesheet" href="root.css"></head><body><a href="pages/other.html">x</a></body></html>`,
      'root.css': 'body{margin:0}',
      'pages/other.html': `<!DOCTYPE html><html><head><link rel="stylesheet" href="../root.css"></head><body>Other</body></html>`,
    };
    const r = runBrowserQA({ files });
    expect(r.scores.asset_integrity?.score).toBe(5);
  });
});
