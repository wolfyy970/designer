/**
 * Shared iframe content preparation utilities.
 */
import { SCREENSHOT_LOAD_DELAY_MS } from './constants';

export { bundleVirtualFS } from './bundle-virtual-fs';

export function prepareIframeContent(code: string): string {
  return code;
}

export function renderErrorHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui; padding: 20px; color: #dc2626;">
    <h3>Rendering Error</h3>
    <pre style="background: #fee; padding: 10px; border-radius: 4px; overflow: auto;">${message}</pre>
  </body>
</html>`;
}

/**
 * Capture a screenshot by rendering HTML in a temporary hidden iframe
 * with `allow-scripts allow-same-origin`, then using html2canvas
 * (bundled, not CDN) from the parent window on the iframe's DOM.
 *
 * The display iframes stay locked down with just `allow-scripts`.
 * This temporary iframe only exists for the duration of capture.
 */
export function captureScreenshot(
  srcdocContent: string,
  width = 1280,
  height = 900
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Screenshot capture timed out'));
    }, 15000);

    const tempIframe = document.createElement('iframe');
    tempIframe.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:' +
      width +
      'px;height:' +
      height +
      'px;opacity:0;pointer-events:none;border:none;';
    tempIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    tempIframe.setAttribute('srcdoc', srcdocContent);

    function cleanup() {
      clearTimeout(timeout);
      tempIframe.remove();
    }

    tempIframe.addEventListener('load', () => {
      // Wait for CDN scripts (React, Babel, Tailwind) to load + React to mount
      setTimeout(async () => {
        try {
          const body = tempIframe.contentDocument?.body;
          if (!body) {
            cleanup();
            reject(new Error('Cannot access iframe document'));
            return;
          }
          const { default: html2canvas } = await import('html2canvas');
          const canvas = await html2canvas(body, {
            width,
            height,
            windowWidth: width,
            windowHeight: height,
            useCORS: true,
            backgroundColor: '#ffffff',
            scale: 1,
          });
          const dataUrl = canvas.toDataURL('image/png', 0.85);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, SCREENSHOT_LOAD_DELAY_MS);
    });

    document.body.appendChild(tempIframe);
  });
}
