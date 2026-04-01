/**
 * Path-only glob matching for virtual workspace paths (forward slashes, no ..).
 * `*` = segment without `/`; `**` = any substring (including `/`).
 */

export function globPatternToRegExp(globPattern: string): RegExp {
  const s = globPattern.trim();
  if (!s) return /^$/;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '*') {
      if (s[i + 1] === '*') {
        i++;
        out += '.*';
      } else {
        out += '[^/]*';
      }
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`, 'i');
}

export function pathMatchesGlob(filePath: string, globPattern: string): boolean {
  return globPatternToRegExp(globPattern).test(filePath);
}
