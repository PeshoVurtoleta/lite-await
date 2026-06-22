// 10-gc.test.mjs
// Heap retention budgets. Under --expose-gc, we verify that the hot paths
// don't accumulate JS-heap allocations beyond the settlement cost.
//
// As in 09-cleanup-leak, the test PATTERN must dispose its own signals each
// cycle, otherwise the test itself leaks signal nodes (orthogonal to the
// library's effect-node cleanup, which is what we're actually measuring).

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, dispose } from "@zakkster/lite-signal";
import { whenSignal, allOf, anyOf, fromPromise } from "../Await.js";

const hasGc = typeof globalThis.gc === "function";

async function deltaHeap(fn) {
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    await fn();
    globalThis.gc();
    return process.memoryUsage().heapUsed - before;
}

test("gc: 10K whenSignal resolve cycles -- heap delta < 1 MB", { skip: !hasGc }, async () => {
    // Warm-up
    for (let i = 0; i < 1000; i++) {
        const s = signal(0);
        const p = whenSignal(s, (n) => n === 1);
        s.set(1);
        await p;
        dispose(s);
    }
    const delta = await deltaHeap(async () => {
        for (let i = 0; i < 10000; i++) {
            const s = signal(0);
            const p = whenSignal(s, (n) => n === 1);
            s.set(1);
            await p;
            dispose(s);
        }
    });
    assert.ok(delta < 1024 * 1024,
        "10K whenSignal cycles: retained heap should be < 1 MB, got " + delta + " B");
});

test("gc: 5K whenSignal abort cycles -- heap delta < 1 MB", { skip: !hasGc }, async () => {
    // Warm-up
    for (let i = 0; i < 500; i++) {
        const ctrl = new AbortController();
        const s = signal(0);
        const p = whenSignal(s, () => false, { signal: ctrl.signal });
        ctrl.abort();
        await p.catch(() => {});
        dispose(s);
    }
    const delta = await deltaHeap(async () => {
        for (let i = 0; i < 5000; i++) {
            const ctrl = new AbortController();
            const s = signal(0);
            const p = whenSignal(s, () => false, { signal: ctrl.signal });
            ctrl.abort();
            await p.catch(() => {});
            dispose(s);
        }
    });
    assert.ok(delta < 1024 * 1024,
        "5K abort cycles: retained heap should be < 1 MB, got " + delta + " B");
});

test("gc: 2K allOf resolve cycles -- heap delta < 1 MB", { skip: !hasGc }, async () => {
    // Warm-up
    for (let i = 0; i < 200; i++) {
        const a = signal(0), b = signal(0);
        const p = allOf([[a, (n) => n === 1], [b, (n) => n === 2]]);
        a.set(1); b.set(2);
        await p;
        dispose(a); dispose(b);
    }
    const delta = await deltaHeap(async () => {
        for (let i = 0; i < 2000; i++) {
            const a = signal(0), b = signal(0);
            const p = allOf([[a, (n) => n === 1], [b, (n) => n === 2]]);
            a.set(1); b.set(2);
            await p;
            dispose(a); dispose(b);
        }
    });
    assert.ok(delta < 1024 * 1024,
        "2K allOf cycles: retained heap should be < 1 MB, got " + delta + " B");
});

test("gc: 2K anyOf resolve cycles -- heap delta < 1 MB", { skip: !hasGc }, async () => {
    // Warm-up
    for (let i = 0; i < 200; i++) {
        const a = signal(0), b = signal(0);
        const p = anyOf([[a, (n) => n === 1], [b, (n) => n === 2]]);
        a.set(1);
        await p;
        dispose(a); dispose(b);
    }
    const delta = await deltaHeap(async () => {
        for (let i = 0; i < 2000; i++) {
            const a = signal(0), b = signal(0);
            const p = anyOf([[a, (n) => n === 1], [b, (n) => n === 2]]);
            a.set(1);
            await p;
            dispose(a); dispose(b);
        }
    });
    assert.ok(delta < 1024 * 1024,
        "2K anyOf cycles: retained heap should be < 1 MB, got " + delta + " B");
});
