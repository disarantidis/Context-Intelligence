/**
 * Transform: replace .toLowerCase() with asciiLowerCase(receiver) in any TS/JS file.
 * Usage: node scripts/replace-tolower-in-code.js <path-to-file>
 *
 * asciiLowerCase is injected by webpack ProvidePlugin (src/ascii-lower.js) and
 * declared globally in src/global.d.ts — no import needed in each file.
 *
 * Handles:
 *   - Single-line and multiline method chains (whitespace only between chain links)
 *   - Template-literal receivers:  `foo ${bar}`.toLowerCase()
 *   - Optional chaining:  value?.toLowerCase()  →  (value == null ? '' : asciiLowerCase(value))
 */
const fs = require('fs');
const filePath = process.argv[2];
if (!filePath) { console.error('Usage: node replace-tolower-in-code.js <file>'); process.exit(1); }

const needle = '.toLowerCase()';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipStringBackward(s, j, quote) {
  let k = j - 1;
  while (k >= 0) {
    if (s[k] === '\\') { k -= 2; continue; }
    if (s[k] === quote) return k - 1;
    k--;
  }
  return -1;
}

/**
 * Skip a template literal backward from position j (which holds the closing `).
 * Counts ${ } nesting so interpolated expressions don't confuse the walk.
 */
function skipTemplateLiteralBackward(s, j) {
  let k = j - 1;
  let depth = 0;
  while (k >= 0) {
    const c = s[k];
    if (depth === 0 && c === '`') return k - 1; // found opening backtick
    if (c === '}') { depth++; k--; continue; }
    if (c === '{' && k > 0 && s[k - 1] === '$') { depth--; k -= 2; continue; }
    if (depth === 0 && (c === "'" || c === '"')) {
      k = skipStringBackward(s, k, c);
      continue;
    }
    k--;
  }
  return -1;
}

function skipWhitespace(s, j) {
  while (j >= 0 && /[\s]/.test(s[j])) j--;
  return j;
}

function walkParensBackward(s, jClose) {
  let d = 1, j = jClose - 1;
  while (j >= 0 && d > 0) {
    const c = s[j];
    if (c === ')') { d++; j--; }
    else if (c === '(') { d--; j--; }
    else if (c === "'" || c === '"') { j = skipStringBackward(s, j, c); }
    else if (c === '`') { j = skipTemplateLiteralBackward(s, j); }
    else { j--; }
  }
  return j;
}

function walkBracketsBackward(s, jClose) {
  let d = 1, j = jClose - 1;
  while (j >= 0 && d > 0) {
    const c = s[j];
    if (c === ']') { d++; j--; }
    else if (c === '[') { d--; j--; }
    else if (c === "'" || c === '"') { j = skipStringBackward(s, j, c); }
    else if (c === '`') { j = skipTemplateLiteralBackward(s, j); }
    else { j--; }
  }
  return j;
}

/**
 * Walk backward from s[dotIdx-1] and return the start index of the receiver.
 *
 * Whitespace is only allowed BETWEEN chain links, i.e. after processing a
 * `.`, `)`, or `]` element.  After an identifier we only continue if the
 * character right before (ignoring whitespace) is also a `.`.
 */
function findReceiverStart(s, dotIdx) {
  let j = dotIdx - 1;
  // Skip leading whitespace (the newline/spaces right before .toLowerCase())
  j = skipWhitespace(s, j);
  if (j < 0) return 0;

  for (;;) {
    if (j < 0) break;
    const c = s[j];

    // ── Identifier or keyword ────────────────────────────────────────────
    if (/[a-zA-Z0-9_$]/.test(c)) {
      while (j >= 0 && /[a-zA-Z0-9_$]/.test(s[j])) j--;
      // After identifier: continue only if the char before it (ignoring
      // whitespace) is a '.' — meaning this is part of a dotted chain.
      const k = skipWhitespace(s, j);
      if (k >= 0 && s[k] === '.') {
        j = k;  // land on the '.', next loop iteration handles it
        continue;
      }
      // No leading '.', this identifier ends the receiver.
      break;
    }

    // ── Method/property dot ──────────────────────────────────────────────
    if (c === '.') {
      j--;
      // Skip whitespace on the other side of the dot (multiline chains)
      j = skipWhitespace(s, j);
      continue;
    }

    // ── Call parens ──────────────────────────────────────────────────────
    // Do NOT skipWhitespace after walkParensBackward: if the paren is
    // a standalone expression preceded by whitespace or `return`, the
    // whitespace is the natural boundary and `(` is the start of the receiver.
    // For a real function call `func(args)`, j lands on the last char of `func`
    // directly (no space between name and `(`) — the identifier branch handles it.
    if (c === ')') {
      j = walkParensBackward(s, j);
      continue;
    }

    // ── Subscript brackets ───────────────────────────────────────────────
    if (c === ']') {
      j = walkBracketsBackward(s, j);
      j = skipWhitespace(s, j);
      continue;
    }

    // ── Template literal ─────────────────────────────────────────────────
    if (c === '`') {
      j = skipTemplateLiteralBackward(s, j);
      // No whitespace skip — a template literal is self-contained
      continue;
    }

    break;
  }
  return j + 1;
}

// ---------------------------------------------------------------------------
// Single-needle transform pass
// ---------------------------------------------------------------------------
function transformOne(src, needle, fn) {
  let out = '', i = 0;
  for (;;) {
    const idx = src.indexOf(needle, i);
    if (idx < 0) { out += src.slice(i); return out; }

    // Optional chaining:  value?.toLowerCase() / value?.toUpperCase()
    const optChain = idx > 0 && src[idx - 1] === '?';
    const walkFrom = optChain ? idx - 1 : idx;
    const start = findReceiverStart(src, walkFrom);
    const receiver = src.slice(start, optChain ? idx - 1 : idx);

    let replacement;
    if (optChain) {
      replacement = '(' + receiver + ' == null ? \'\' : ' + fn + '(' + receiver + '))';
    } else {
      replacement = fn + '(' + receiver + ')';
    }

    out += src.slice(i, start) + replacement;
    i = idx + needle.length;
  }
}

// ---------------------------------------------------------------------------
// Run both needles
// ---------------------------------------------------------------------------
let src = fs.readFileSync(filePath, 'utf8');
const NEEDLES = [
  { needle: '.toLowerCase()', fn: 'asciiLowerCase' },
  { needle: '.toUpperCase()', fn: 'asciiUpperCase' },
];
let changed = false;
for (const { needle, fn } of NEEDLES) {
  if (!src.includes(needle)) continue;
  src = transformOne(src, needle, fn);
  if (src.includes(needle)) throw new Error('transform left ' + needle + ' in ' + filePath);
  changed = true;
}
if (!changed) {
  console.log('SKIP (nothing to transform):', filePath);
  process.exit(0);
}
fs.writeFileSync(filePath, src);
console.log('OK:', filePath);
