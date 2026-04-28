export interface TaskAgentResultFileResolution {
  result: string;
  resultFile: string;
}

export function resolveTaskAgentResultFile(input: {
  files: Record<string, string>;
  resultFile: string;
  fallback: 'firstNonEmptyFile' | 'strict';
}): TaskAgentResultFileResolution | undefined {
  const expectedContent = input.files[input.resultFile];
  if (expectedContent != null) {
    return { result: expectedContent, resultFile: input.resultFile };
  }

  if (input.fallback === 'strict') return undefined;

  const firstFile = Object.entries(input.files).find(
    ([, content]) => content.trim().length > 0,
  );
  if (!firstFile) return undefined;

  const [resultFile, result] = firstFile;
  return { result, resultFile };
}
