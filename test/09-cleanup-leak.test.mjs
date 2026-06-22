// 09-cleanup-leak.test.mjs
// Structural cleanup verification. Every settlement path (resolve, reject,
// timeout, abort) MUST return the effect node to lite-signal's pool.
//
// This is the regression test for the entire library's reason for being:
// the naive "promise from signal" pattern leaks observer slots, and lite-await
// fixes that. Pre-fix, a high-volume create+cancel pattern would exhaust the
// lite-signal default registry.
//
// Note: the test PATTERN must `dispose()` the test-side signals each cycle.
// Without that, the test itself leaks signal nodes (orthogonal to the library)
// and trips lite-signal's pool ceiling at 1024 cycles. The library's job is to
// release its own effect nodes; test signal disposal is the caller's job.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats, dispose } from "@zakkster/lite-signal";
import { whenSignal, allOf, anyOf, raceOf, withTimeout, withAbort, fromPromise, TimeoutError } from "../Await.js";

test("cleanup: 4K whenSignal resolve cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 4096; i++) {
        const s = signal(0);
        const p = whenSignal(s, (n) => n === 1);
        s.set(1);
        await p;
        dispose(s);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: 2K whenSignal timeout cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 2000; i++) {
        const s = signal(0);
        try {
            await whenSignal(s, (n) => n === 999, { timeout: 0 });
        } catch {}
        dispose(s);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: 2K whenSignal abort cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 2000; i++) {
        const ctrl = new AbortController();
        const s = signal(0);
        const p = whenSignal(s, (n) => n === 999, { signal: ctrl.signal });
        ctrl.abort();
        try { await p; } catch {}
        dispose(s);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: 1K allOf resolve cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 1000; i++) {
        const a = signal(0), b = signal(0);
        const p = allOf([
            [a, (n) => n === 1],
            [b, (n) => n === 2]
        ]);
        a.set(1); b.set(2);
        await p;
        dispose(a); dispose(b);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: 1K anyOf resolve cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 1000; i++) {
        const a = signal(0), b = signal(0);
        const p = anyOf([
            [a, (n) => n === 1],
            [b, (n) => n === 2]
        ]);
        a.set(1);
        await p;
        dispose(a); dispose(b);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: 1K raceOf resolve cycles do not leak", async () => {
    const before = stats().effects;
    for (let i = 0; i < 1000; i++) {
        const a = signal(0), b = signal(0);
        const p = raceOf([
            [a, (n) => n === 1],
            [b, (n) => n === 2]
        ]);
        b.set(2);
        await p;
        dispose(a); dispose(b);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("cleanup: mixed settlement paths in sequence -- aggregate baseline", async () => {
    const before = stats().effects;
    for (let i = 0; i < 500; i++) {
        const a = signal(0), b = signal(0);
        const mode = i % 4;
        if (mode === 0) {
            const p = whenSignal(a, (n) => n === 1);
            a.set(1);
            await p;
        } else if (mode === 1) {
            try { await whenSignal(a, (n) => n === 999, { timeout: 0 }); } catch {}
        } else if (mode === 2) {
            const ctrl = new AbortController();
            const p = whenSignal(a, (n) => n === 999, { signal: ctrl.signal });
            ctrl.abort();
            try { await p; } catch {}
        } else {
            const p = allOf([[a, (n) => n === 1], [b, (n) => n === 2]]);
            a.set(1); b.set(2);
            await p;
        }
        dispose(a); dispose(b);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before, "mixed settlement paths must all clean up");
});
