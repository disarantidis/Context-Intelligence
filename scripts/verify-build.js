const fs = require('fs');
const s = fs.readFileSync('dist/code.js', 'utf8');
const lines = s.split('\n');

// Find every line containing .toLowerCase()
const hits = [];
lines.forEach((l, i) => {
  const c = (l.match(/\.toLowerCase\(\)/g) || []).length;
  if (c > 0) hits.push({ line: i + 1, count: c, preview: l.trim().slice(0, 80) });
});
console.log('Lines with .toLowerCase():', hits.length);
hits.forEach(h => console.log('  line', h.line, '('+h.count+'x):', h.preview));

// Count asciiLowerCase
const aLC = (s.match(/asciiLowerCase/g) || []).length;
console.log('asciiLowerCase references:', aLC);

// Intl references (not in comment lines or string literals — rough check)
let intlCount = 0;
lines.forEach(l => {
  const trimmed = l.trim();
  if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && l.includes('Intl')) intlCount++;
});
console.log('Intl in non-comment lines:', intlCount);
