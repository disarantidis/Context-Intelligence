/**
 * Case-insensitive ASCII-ish string compare without `String#localeCompare`
 * or native `String#toLowerCase` (strict Figma plugin main-thread VMs).
 */
function asciiLower(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s.charAt(i);
  }
  return out;
}

export function compareAsciiInsensitive(a: string, b: string): number {
  const aa = asciiLower(a || '');
  const bb = asciiLower(b || '');
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}
