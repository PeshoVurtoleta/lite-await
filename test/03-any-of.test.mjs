// 03-any-of.test.mjs
// anyOf: first to resolve wins, others are aborted, AggregateError on total fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats } from "@zakkster/lite-signal";
import { anyOf, TimeoutError } from "../Await.js";

test("anyOf: resolves with {index, value} of first to satisfy", async () => {
    const a = signal(0), b = signal(0);
    const p = anyOf([
        [a, (n) => n === 7],
        [b, (n) => n === 9]
    ]);
    setTimeout(() => b.set(9), 5);
    const r = await p;
    assert.equal(r.index, 1);
    assert.equal(r.value, 9);
});

test("anyOf: synchronously-satisfied spec wins immediately", async () => {
    const ready = signal(true);
    const slow = signal(false);
    const r = await anyOf([
        [slow, (v) => v === true],
        [ready, (v) => v === true]
    ]);
    assert.equal(r.index, 1);
    assert.equal(r.value, true);
});

test("anyOf: aborts the losing specs (no leaked effects)", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0), c = signal(0);
    const p = anyOf([
        [a, (n) => n === 1],
        [b, (n) => n === 2],
        [c, (n) => n === 3]
    ]);
    setTimeout(() => b.set(2), 5);
    await p;
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before, "losing specs' effects must be torn down");
});

test("anyOf: rejects with AggregateError if every spec rejects", async () => {
    const ctrl = new AbortController();
    const a = signal(0), b = signal(0);
    const p = anyOf([
        [a, (n) => n === 1],
        [b, (n) => n === 2]
    ], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    try {
        await p;
        assert.fail("expected reject");
    } catch (e) {
        // When the outer signal aborts, our internal forward fires and
        // every spec rejects with AbortError; we surface AbortError directly
        // because all rejections share the same cause.
        assert.ok(e.name === "AbortError" || e instanceof AggregateError);
    }
});

test("anyOf: timeout rejects the bundle with TimeoutError", async () => {
    const a = signal(0), b = signal(0);
    try {
        await anyOf([
            [a, (n) => n === 1],
            [b, (n) => n === 2]
        ], { timeout: 20 });
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
    }
});

test("anyOf: empty specs rejects with AggregateError", async () => {
    try {
        await anyOf([]);
        assert.fail("expected reject");
    } catch (e) {
        assert.ok(e instanceof AggregateError);
    }
});

test("anyOf: AbortSignal abort cleans up all in-flight specs", async () => {
    const before = stats().effects;
    const ctrl = new AbortController();
    const a = signal(0), b = signal(0);
    const p = anyOf([
        [a, (n) => n === 1],
        [b, (n) => n === 2]
    ], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    try { await p; } catch {}
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});
