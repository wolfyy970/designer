import { beforeAll, afterAll, vi } from 'vitest';

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined;
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function isExpectedPersistStorageWarning(args: unknown[]): boolean {
  return args.some((arg) =>
    typeof arg === 'string' &&
    arg.includes('[zustand persist middleware] Unable to update item')
  );
}

beforeAll(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (isExpectedPersistStorageWarning(args)) {
      return;
    }
    originalConsoleError(...args);
  });
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (isExpectedPersistStorageWarning(args)) {
      return;
    }
    originalConsoleWarn(...args);
  });
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
  consoleWarnSpy?.mockRestore();
  consoleErrorSpy = undefined;
  consoleWarnSpy = undefined;
});
