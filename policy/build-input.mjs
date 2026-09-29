// Lab 06 — merges this build's scan reports into the single input document OPA evaluates.
// usage: node policy/build-input.mjs <audit.json> <trivy.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [auditPath, trivyPath, outPath] = process.argv.slice(2);
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
writeFileSync(outPath, JSON.stringify({ audit: read(auditPath), trivy: read(trivyPath) }, null, 2));
