const fs = require('fs');
const path = require('path');
const root = path.join(process.cwd());
const dirs = [
  path.join(root, 'node_modules', '.prisma', 'client'),
  path.join(root, 'node_modules', '@prisma', 'client'),
  path.join(root, 'backend', 'prisma'),
];
function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(p));
    } else {
      if (/\.(js|d\.ts|prisma|json)$/i.test(entry.name)) results.push(p);
    }
  }
  return results;
}
for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('colonne')) {
      console.log(file);
      content.split(/\r?\n/).forEach((line, idx) => {
        if (line.includes('colonne')) console.log(`${idx+1}: ${line}`);
      });
    }
  }
}
