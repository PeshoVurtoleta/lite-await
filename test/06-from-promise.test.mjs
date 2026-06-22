// 06-from-promise.test.mjs
// fromPromise: signal-shaped async state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { effect, dispose } from "@zakkster/lite-signal";
import { fromPromise } from "../Await.js";

test("fromPromise: starts in pending state", () => {
    const sig = fromPromise(new Promise(() => {}));   // never settles
    const s = sig.peek();
    assert.equal(s.status, "pending");
    assert.equal(s.data, undefined);
    assert.equal(s.error, undefined);
    dispose(sig);
});

test("fromPromise: holds initialData while pending", () => {
    const sig = fromPromise(new Promise(() => {}), "placeholder");
    assert.equal(sig.peek().data, "placeholder");
    dispose(sig);
});

test("fromPromise: transitions to resolved on settlement", async () => {
    const sig = fromPromise(Promise.resolve("hello"));
    await new Promise((r) => setTimeout(r, 5));
    const s = sig.peek();
    assert.equal(s.status, "resolved");
    assert.equal(s.data, "hello");
    assert.equal(s.error, undefined);
    dispose(sig);
});

test("fromPromise: transitions to rejected on settlement", async () => {
    const err = new Error("nope");
    // Pre-catch the underlying promise so Node doesn't flag "unhandled rejection"
    const inner = Promise.reject(err).catch((e) => { throw e; });
    const sig = fromPromise(inner);
    sig.peek();  // touch
    await new Promise((r) => setTimeout(r, 5));
    const s = sig.peek();
    assert.equal(s.status, "rejected");
    assert.equal(s.data, undefined);
    assert.equal(s.error, err);
    dispose(sig);
});

test("fromPromise: rejected state preserves initialData", async () => {
    const sig = fromPromise(Promise.reject("e").catch((e) => { throw e; }), "fallback");
    await new Promise((r) => setTimeout(r, 5));
    const s = sig.peek();
    assert.equal(s.status, "rejected");
    assert.equal(s.data, "fallback");
    dispose(sig);
});

test("fromPromise: triggers a tracked effect on settlement", async () => {
    const sig = fromPromise(Promise.resolve(99));
    const seen = [];
    const stop = effect(() => { seen.push(sig().status); });
    assert.equal(seen[0], "pending");
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(seen, ["pending", "resolved"]);
    stop();
    dispose(sig);
});

test("fromPromise: signal is disposable -- returns node to pool", () => {
    // Sanity that the consumer can dispose. Behavior post-dispose is the
    // standard lite-signal disposed-signal behavior; we just verify no throw.
    const sig = fromPromise(Promise.resolve(1));
    dispose(sig);
    // Idempotent
    dispose(sig);
});
