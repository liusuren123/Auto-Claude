const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'src/shared/i18n/locales');
const namespaces = fs.readdirSync(path.join(base, 'en')).filter((f) => f.endsWith('.json'));

function flatten(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatten(v, key));
    } else {
      out.push(key);
    }
  }
  return out;
}

let totalMissing = 0;
let totalExtra = 0;

for (const ns of namespaces) {
  const en = JSON.parse(fs.readFileSync(path.join(base, 'en', ns), 'utf8'));
  const zhPath = path.join(base, 'zh', ns);
  if (!fs.existsSync(zhPath)) {
    console.log(`[MISSING FILE] zh/${ns}`);
    totalMissing += 1;
    continue;
  }
  const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));

  const enKeys = new Set(flatten(en));
  const zhKeys = new Set(flatten(zh));

  const missing = [...enKeys].filter((k) => !zhKeys.has(k));
  const extra = [...zhKeys].filter((k) => !enKeys.has(k));

  totalMissing += missing.length;
  totalExtra += extra.length;

  if (missing.length || extra.length) {
    console.log(`\n=== ${ns} ===`);
    if (missing.length) console.log(`  missing in zh (${missing.length}):`, missing.slice(0, 20));
    if (extra.length) console.log(`  extra in zh (${extra.length}):`, extra.slice(0, 20));
  } else {
    console.log(`[OK] ${ns}: ${enKeys.size} keys match`);
  }
}

console.log(`\nTOTAL missing=${totalMissing} extra=${totalExtra}`);
