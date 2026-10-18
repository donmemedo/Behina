import { performance } from "node:perf_hooks";
const count = 10000;
const formatter = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const measure = (fn) => {
  const start = performance.now();
  for (let i = 0; i < count; i++) fn(i * 156000);
  return Number((performance.now() - start).toFixed(2));
};
console.log(JSON.stringify({ iterations: count,
  uncached_ms: measure((n) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(n)),
  cached_ms: measure((n) => formatter.format(n)) }, null, 2));
