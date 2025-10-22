const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else if (e.isFile() && full.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = walk(root);
let ok = 0, err = 0;
for (const f of files) {
  try {
    const code = fs.readFileSync(f, 'utf8');
    // Try to create a SourceTextModule to parse as ES module without executing
    const m = new vm.SourceTextModule(code, { context: vm.createContext({}), initializeImportMeta: () => {} });
    // No syntax error thrown means parse OK
    console.log('OK:', f);
    ok++;
  } catch (e) {
    console.error('ERR:', f, e.message);
    err++;
  }
}
console.log(`Summary: ${ok} OK, ${err} ERR`);
if (err > 0) process.exit(1);
