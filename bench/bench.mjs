// bench/bench.mjs
// Honest benchmarks. Run under --expose-gc; warm-up rounds are excluded from
// timing. Each scenario disposes its test-side signals so the benchmark itself
// doesn't trip lite-signal's pool ceiling.
//
//   npm run bench
//
// Scenarios:
//   1. whenSignal resolve   -- fast-path: predicate satisfied on first set
//   2. whenSignal abort     -- pre-aborted controller, synchronous reject
//   3. allOf 4-spec resolve -- bundle of 4 signals, all resolve in microtask
//   4. anyOf 4-spec resolve -- first to satisfy wins, siblings aborted
//   5. raceOf 4-spec resolve -- first to settle wins
//   6. fromPromise lifecycle -- pending -> resolved, signal disposed

import { signal, dispose, stats } from "@zakkster/lite-signal";
import { whenSignal, allOf, anyOf, raceOf, fromPromise } from "../Await.js";

const hasGc = typeof globalThis.gc === "function";
if (!hasGc) {
    console.error("bench: run with --expose-gc (npm run bench)");
    process.exit(1);
}

function nowMs() { return Number(process.hrtime.bigint()) / 1e6; }

function fmt(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "G";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(0);
}

function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / 1024 / 1024).toFixed(2) + " MB";
}

async function run(name, warmup, iters, fn) {
    // Warm-up
    for (let i = 0; i < warmup; i++) await fn();
    globalThis.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    const t0 = nowMs();
    for (let i = 0; i < iters; i++) await fn();
    const elapsed = nowMs() - t0;
    globalThis.gc();
    const retainedDelta = process.memoryUsage().heapUsed - heapBefore;
    const opsPerSec = iters / (elapsed / 1000);
    const perOpRetained = retainedDelta / iters;
    console.log(
        "  " + name.padEnd(34) +
        fmt(opsPerSec).padStart(8) + " ops/s   " +
        (elapsed.toFixed(1) + "ms").padStart(9) + "   retained " +
        fmtBytes(retainedDelta).padStart(8) + "  (" + perOpRetained.toFixed(1) + " B/op)"
    );
}

console.log("\nlite-await 1.0.0 benchmarks  (node " + process.versions.node + ")");
console.log("baseline pool: " + JSON.stringify(stats()) + "\n");

// --- 1. whenSignal resolve ------------------------------------------------
await run("whenSignal resolve", 2000, 20000, async () => {
    const s = signal(0);
    const p = whenSignal(s, (n) => n === 1);
    s.set(1);
    await p;
    dispose(s);
});

// --- 2. whenSignal abort (pre-aborted) ------------------------------------
await run("whenSignal pre-aborted", 2000, 20000, async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const s = signal(0);
    try { await whenSignal(s, () => false, { signal: ctrl.signal }); } catch {}
    dispose(s);
});

// --- 3. allOf 4-spec resolve ----------------------------------------------
await run("allOf 4-spec resolve", 1000, 10000, async () => {
    const a = signal(0), b = signal(0), c = signal(0), d = signal(0);
    const p = allOf([
        [a, (n) => n === 1],
        [b, (n) => n === 1],
        [c, (n) => n === 1],
        [d, (n) => n === 1]
    ]);
    a.set(1); b.set(1); c.set(1); d.set(1);
    await p;
    dispose(a); dispose(b); dispose(c); dispose(d);
});

// --- 4. anyOf 4-spec resolve ----------------------------------------------
await run("anyOf 4-spec resolve", 1000, 10000, async () => {
    const a = signal(0), b = signal(0), c = signal(0), d = signal(0);
    const p = anyOf([
        [a, (n) => n === 1],
        [b, (n) => n === 1],
        [c, (n) => n === 1],
        [d, (n) => n === 1]
    ]);
    b.set(1);
    await p;
    dispose(a); dispose(b); dispose(c); dispose(d);
});

// --- 5. raceOf 4-spec resolve ---------------------------------------------
await run("raceOf 4-spec resolve", 1000, 10000, async () => {
    const a = signal(0), b = signal(0), c = signal(0), d = signal(0);
    const p = raceOf([
        [a, (n) => n === 1],
        [b, (n) => n === 1],
        [c, (n) => n === 1],
        [d, (n) => n === 1]
    ]);
    c.set(1);
    await p;
    dispose(a); dispose(b); dispose(c); dispose(d);
});

// --- 6. fromPromise lifecycle ---------------------------------------------
await run("fromPromise pending->resolved", 1000, 10000, async () => {
    const sig = fromPromise(Promise.resolve(42));
    await new Promise((r) => queueMicrotask(r));   // flush microtask for resolution
    sig.peek();
    dispose(sig);
});

console.log("\nfinal pool: " + JSON.stringify(stats()));
