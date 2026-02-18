import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running tests...');
let failed = 0;

const testFiles = fs.readdirSync(path.join(__dirname)).filter(f => f.startsWith('test_') && f.endsWith('.js'));
for (const tf of testFiles) {
  const p = path.join(__dirname, tf);
  try {
    const mod = await import(pathToFileURL(p).href);
    if (typeof mod.runTests === 'function') {
      await mod.runTests();
    }
    console.log(`✅ ${tf}`);
  } catch (err) {
    failed++;
    console.error(`❌ ${tf} failed:`);
    console.error(err);
  }
}

if (failed > 0) {
  console.error(`${failed} test file(s) failed.`);
  process.exit(1);
} else {
  console.log('All tests passed.');
  process.exit(0);
}

function pathToFileURL(p) {
  const u = new URL('file://' + path.resolve(p));
  return u;
}
