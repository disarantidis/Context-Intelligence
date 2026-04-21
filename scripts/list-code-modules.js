const fs = require('fs');
const s = fs.readFileSync('dist/code.js', 'utf8');
const m = s.match(/"\.\/src\/[^"]+"/g) || [];
const unique = Array.from(new Set(m)).sort();
console.log(unique.join('\n'));
