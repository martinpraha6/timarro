// Guards the M2 contract: the core entry and the CDN bundle must not pull in
// zod — it belongs to the `timarro/schema` subpath only.
import { readFile } from 'node:fs/promises';

let failed = false;
for (const file of ['dist/index.js', 'dist/index.cjs', 'dist/timarro.min.js']) {
  const source = await readFile(file, 'utf8');
  if (/["']zod["']|zod\/v4|z\.ZodType/.test(source)) {
    console.error(`✗ ${file} references zod — the core bundle must stay dependency-free`);
    failed = true;
  } else {
    console.log(`✓ ${file} is zod-free`);
  }
}
process.exit(failed ? 1 : 0);
