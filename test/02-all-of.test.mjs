// 02-all-of.test.mjs
// allOf: wait for every spec, in-order values, fail-fast, cleanup on failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats } from "@zakkster/lite-signal";
import { allOf, TimeoutError } from "../Await.js";

test("allOf: resolves with values in spec order", async () => {
    const a = signal(0), b = signal(0), c = signal(0);
    const p = allOf([
        [a, (n) => n > 0],
        [b, (n) => n > 0],
        [c, (n) => n > 0]
    ]);
    setTimeout(() => { a.set(10); b.set(20); c.set(30); }, 5);
    assert.deepEqual(await p, [10, 20, 30]);
});

test("allOf: still resolves with input order even if specs resolve out of order", async () => {
    const a = signal(0), b = signal(0), c = signal(0);
    const p = allOf([
        [a, (n) => n > 0],
        [b, (n) => n > 0],
        [c, (n) => n > 0]
    ]);
    setTimeout(() => c.set(3), 2);
    setTimeout(() => a.set(1), 4);
    setTimeout(() => b.set(2), 6);
    assert.deepEqual(await p, [1, 2, 3]);
});

test("allOf: synchronously-satisfied specs work alongside async ones", async () => {
    const sync = signal(true);
    const asyncSig = signal(false);
    const p = allOf([
        [sync, (v) => v === true],
        [asyncSig, (v) => v === true]
    ]);
    setTimeout(() => asyncSig.set(true), 5);
    assert.deepEqual(await p, [true, true]);
});

test("allOf: empty array resolves immediately to empty array", async () => {
    assert.deepEqual(await allOf([]), []);
});

test("allOf: rejects on timeout, aborts in-flight specs", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    try {
        await allOf([
            [a, (n) => n > 100],
            [b, (n) => n > 100]
        ], { timeout: 20 });
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
    }
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(stats().effects, before, "all spec effects should be cleaned up");
});

test("allOf: rejects when AbortSignal aborts", async () => {
    const ctrl = new AbortController();
    const a = signal(0), b = signal(0);
    const p = allOf([
        [a, (n) => n > 100],
        [b, (n) => n > 100]
    ], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    try {
        await p;
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("allOf: rejects TypeError for non-array specs", () => {
    return allOf("not an array").then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof TypeError)
    );
});

test("allOf: rejects TypeError for malformed spec", () => {
    return allOf([["not a tuple"]]).then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof TypeError)
    );
});

test("allOf: full cleanup on success -- no effect nodes leak", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    const p = allOf([
        [a, (n) => n > 0],
        [b, (n) => n > 0]
    ]);
    setTimeout(() => { a.set(1); b.set(2); }, 5);
    await p;
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});
