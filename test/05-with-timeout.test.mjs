// 05-with-timeout.test.mjs
// withTimeout / withAbort: arbitrary-promise wrappers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { withTimeout, withAbort, TimeoutError } from "../Await.js";

test("withTimeout: resolves through when inner resolves first", async () => {
    const v = await withTimeout(Promise.resolve("ok"), 100);
    assert.equal(v, "ok");
});

test("withTimeout: rejects with TimeoutError when inner is slow", async () => {
    const slow = new Promise((r) => setTimeout(() => r("late"), 50));
    try {
        await withTimeout(slow, 10);
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
        assert.equal(e.timeout, 10);
    }
});

test("withTimeout: propagates inner rejection if it loses the race", async () => {
    const failing = new Promise((_, rej) => setTimeout(() => rej(new Error("boom")), 5));
    try {
        await withTimeout(failing, 100);
        assert.fail("expected reject");
    } catch (e) {
        assert.equal(e.message, "boom");
    }
});

test("withTimeout: ms=Infinity returns the promise unchanged", async () => {
    const inner = Promise.resolve(123);
    const wrapped = withTimeout(inner, Infinity);
    assert.equal(wrapped, inner);
});

test("withTimeout: ms=undefined returns the promise unchanged", async () => {
    const inner = Promise.resolve(123);
    const wrapped = withTimeout(inner, undefined);
    assert.equal(wrapped, inner);
});

test("withTimeout: rejects RangeError for negative ms", () => {
    return withTimeout(Promise.resolve(1), -1).then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof RangeError)
    );
});

test("withAbort: resolves through when inner resolves first", async () => {
    const ctrl = new AbortController();
    const v = await withAbort(Promise.resolve("ok"), ctrl.signal);
    assert.equal(v, "ok");
});

test("withAbort: rejects when signal aborts mid-flight", async () => {
    const ctrl = new AbortController();
    const slow = new Promise((r) => setTimeout(() => r("late"), 100));
    setTimeout(() => ctrl.abort(), 5);
    try {
        await withAbort(slow, ctrl.signal);
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("withAbort: rejects immediately when signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    try {
        await withAbort(Promise.resolve("x"), ctrl.signal);
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("withAbort: undefined signal returns the promise unchanged", () => {
    const inner = Promise.resolve(1);
    assert.equal(withAbort(inner, undefined), inner);
});

test("withAbort: null signal returns the promise unchanged", () => {
    const inner = Promise.resolve(1);
    assert.equal(withAbort(inner, null), inner);
});
