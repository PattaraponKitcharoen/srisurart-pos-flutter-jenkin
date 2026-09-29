// Lab 10 — Pipeline Health Gate: is the build farm healthy enough to ship to production?
//
// Success rate of the last N finished runs on this Jenkins (default 20), from the Lab 09
// Prometheus. The Metrics plugin exports running counters (jenkins_runs_total_total,
// jenkins_runs_success_total), not per-build history, so the script walks the counters back
// in time until N runs have finished and compares how many of those ended SUCCESS.
// A counter that drops is a Jenkins restart: the new value is the increment since then.
//
// env: PROMETHEUS_URL, HEALTH_BUILDS (20), HEALTH_MIN_SUCCESS (0.90). Exit 1 = do not deploy.
const base = process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
const wanted = Number(process.env.HEALTH_BUILDS ?? 20);
const minRate = Number(process.env.HEALTH_MIN_SUCCESS ?? 0.9);

// One `end` for both queries, so their samples land on the same timestamps.
const end = Math.floor(Date.now() / 60000) * 60;

async function series(query) {
  const params = new URLSearchParams({ query, start: String(end - 7 * 86400), end: String(end), step: '60' });
  const res = await fetch(`${base}/api/v1/query_range?${params}`);
  if (!res.ok) throw new Error(`Prometheus answered HTTP ${res.status} for ${query}`);
  const body = await res.json();
  const result = body.data?.result ?? [];
  if (result.length !== 1) throw new Error(`expected one series for ${query}, got ${result.length}`);
  return new Map(result[0].values.map(([t, v]) => [t, Number(v)]));
}

const total = await series('sum(jenkins_runs_total_total)');
const success = await series('sum(jenkins_runs_success_total)');
const times = [...total.keys()].filter((t) => success.has(t)).sort((a, b) => a - b);
if (times.length < 2) throw new Error('not enough Prometheus samples to judge pipeline health');

// Walk from the newest sample backwards, adding up what finished in each step.
let runs = 0;
let ok = 0;
let since = times[times.length - 1];
for (let i = times.length - 1; i > 0 && runs < wanted; i--) {
  const [t, prev] = [times[i], times[i - 1]];
  const dTotal = total.get(t) >= total.get(prev) ? total.get(t) - total.get(prev) : total.get(t);
  const dOk = success.get(t) >= success.get(prev) ? success.get(t) - success.get(prev) : success.get(t);
  runs += dTotal;
  ok += dOk;
  since = prev;
}

const rate = runs === 0 ? 1 : ok / runs;
const pct = (x) => `${(100 * x).toFixed(1)}%`;
console.log(`Pipeline health: ${ok}/${runs} of the last runs succeeded (${pct(rate)}), ` +
  `since ${new Date(since * 1000).toISOString()}; required: ${pct(minRate)} over ${wanted} runs`);
if (runs < wanted) console.log(`note: only ${runs} finished runs in Prometheus' 7-day window`);
if (rate < minRate) {
  console.error(`Pipeline Health Gate: ${pct(rate)} < ${pct(minRate)}, refusing to deploy to production`);
  process.exit(1);
}
console.log('Pipeline Health Gate passed');
