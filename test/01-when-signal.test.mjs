// 01-when-signal.test.mjs
// whenSignal: predicate satisfaction, sync initial match, timeout, abort,
// validation, structural cleanup.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats } from "@zakkster/lite-signal";
import { whenSignal, TimeoutError } from "../Await.js";

test("whenSignal: resolves with value when predicate first passes", async () => {
    const s = signal("loading");
    const p = whenSignal(s, (v) => v === "ready");
    queueMicrotask(() => s.set("ready"));
    const v = await p;
    assert.equal(v, "ready");
});

test("whenSignal: resolves synchronously when predicate is already true on initial read", async () => {
    const s = signal(42);
    const v = await whenSignal(s, (n) => n === 42);
    assert.equal(v, 42);
});

test("whenSignal: passes the actual satisfying value, not the predicate's return", async () => {
    const s = signal({ id: 1, name: "alice" });
    const v = await whenSignal(s, (u) => u.name === "alice");
    assert.deepEqual(v, { id: 1, name: "alice" });
});

test("whenSignal: rejects with TimeoutError when timeout elapses first", async () => {
    const s = signal("nope");
    const t0 = Date.now();
    try {
        await whenSignal(s, (v) => v === "yes", { timeout: 20 });
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
        assert.equal(e.name, "TimeoutError");
        assert.equal(e.timeout, 20);
        const elapsed = Date.now() - t0;
        assert.ok(elapsed >= 18, "timeout fired too early: " + elapsed + "ms");
    }
});

test("whenSignal: rejects when AbortSignal aborts", async () => {
    const ctrl = new AbortController();
    const s = signal("x");
    setTimeout(() => ctrl.abort(), 5);
    try {
        await whenSignal(s, (v) => v === "never", { signal: ctrl.signal });
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("whenSignal: rejects immediately when AbortSignal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const s = signal("x");
    try {
        await whenSignal(s, (v) => v === "x", { signal: ctrl.signal });
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("whenSignal: AbortSignal reason is propagated as the rejection", async () => {
    const ctrl = new AbortController();
    const myReason = new Error("user cancelled");
    const s = signal("x");
    setTimeout(() => ctrl.abort(myReason), 5);
    try {
        await whenSignal(s, (v) => v === "never", { signal: ctrl.signal });
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e, myReason);
    }
});

test("whenSignal: rejects TypeError for non-function source", () => {
    return whenSignal("not a function", (v) => v).then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof TypeError)
    );
});

test("whenSignal: rejects TypeError for non-function predicate", () => {
    const s = signal(1);
    return whenSignal(s, "not a function").then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof TypeError)
    );
});

test("whenSignal: rejects RangeError for negative timeout", () => {
    const s = signal(1);
    return whenSignal(s, (v) => false, { timeout: -1 }).then(
        () => assert.fail("expected reject"),
        (e) => assert.ok(e instanceof RangeError)
    );
});

test("whenSignal: cleanup happens on resolve -- no effect node lingers", async () => {
    const before = stats().effects;
    const s = signal("loading");
    const p = whenSignal(s, (v) => v === "ready");
    queueMicrotask(() => s.set("ready"));
    await p;
    // Allow any scheduled cleanup to flush.
    await new Promise((r) => setTimeout(r, 5));
    const after = stats().effects;
    assert.equal(after, before, "effects should return to baseline");
});

test("whenSignal: cleanup happens on timeout -- no effect node lingers", async () => {
    const before = stats().effects;
    const s = signal("x");
    try {
        await whenSignal(s, (v) => v === "never", { timeout: 10 });
    } catch {}
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("whenSignal: cleanup happens on abort -- no effect node lingers", async () => {
    const before = stats().effects;
    const ctrl = new AbortController();
    const s = signal("x");
    setTimeout(() => ctrl.abort(), 5);
    try {
        await whenSignal(s, (v) => v === "never", { signal: ctrl.signal });
    } catch {}
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});
