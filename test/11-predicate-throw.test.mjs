// 11-predicate-throw.test.mjs
// A throwing predicate (or source getter) must settle the promise by REJECTING
// with the thrown value -- on both the synchronous first read and on later
// change-driven fires -- and must tear the effect down on the way out.
//
// Pre-fix, a throw on a change-driven fire unwound through lite-signal's
// flushEffects and escaped at the signal-WRITER's `.set()` call site, leaving
// the whenSignal promise pending forever with a live, leaked effect node. This
// is the regression net for that path: it is exactly the "no settlement path
// skips cleanup" invariant, applied to the throwing-predicate case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats, dispose } from "@zakkster/lite-signal";
import { whenSignal, allOf, anyOf, raceOf } from "../Await.js";

test("predicate-throw: synchronous first-read throw rejects with the thrown value", async () => {
    const before = stats().effects;
    const s = signal(0);
    const err = new Error("sync-pred-throw");
    await assert.rejects(
        whenSignal(s, () => { throw err; }),
        (e) => e === err
    );
    await new Promise((r) => setTimeout(r, 5));
    dispose(s);
    assert.equal(stats().effects, before, "sync throw must not leak an effect");
});

test("predicate-throw: change-driven throw rejects (does NOT escape at the writer)", async () => {
    const before = stats().effects;
    const s = signal(0);
    const err = new Error("late-pred-throw");

    const p = whenSignal(s, (n) => {
        if (n === 1) throw err;
        return false;
    });

    // The throw must be delivered to the awaiter, not raised here at .set().
    let threwAtWriter = null;
    queueMicrotask(() => {
        try { s.set(1); }
        catch (e) { threwAtWriter = e; }
    });

    await assert.rejects(p, (e) => e === err);
    await new Promise((r) => setTimeout(r, 5));
    dispose(s);

    assert.equal(threwAtWriter, null, "throw must not surface at the signal writer's .set()");
    assert.equal(stats().effects, before, "change-driven throw must not leak an effect");
});

test("predicate-throw: a throwing source() getter also rejects and cleans up", async () => {
    const before = stats().effects;
    const gate = signal(0);
    const err = new Error("source-throw");

    // source() reads `gate` (so the effect tracks it), then throws once it flips.
    const source = () => {
        const g = gate();
        if (g === 1) throw err;
        return g;
    };

    const p = whenSignal(source, (v) => v === 999);
    queueMicrotask(() => gate.set(1));

    await assert.rejects(p, (e) => e === err);
    await new Promise((r) => setTimeout(r, 5));
    dispose(gate);
    assert.equal(stats().effects, before, "throwing source must not leak an effect");
});

test("predicate-throw: timeout/abort cleanup still removed when a throw settles first", async () => {
    const before = stats().effects;
    const ctrl = new AbortController();
    const s = signal(0);
    const err = new Error("throw-with-timeout-and-signal");

    const p = whenSignal(s, (n) => { if (n === 1) throw err; return false; },
        { timeout: 60000, signal: ctrl.signal });
    queueMicrotask(() => s.set(1));

    await assert.rejects(p, (e) => e === err);
    await new Promise((r) => setTimeout(r, 5));
    dispose(s);
    // If the 60s timer or the abort listener leaked, process teardown would hang
    // / retain; the effect-count check is the structural proxy here.
    assert.equal(stats().effects, before, "timer + abort listener must be cleared on a throw-settled reject");
});

test("predicate-throw: combinators reject the bundle when a child predicate throws", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    const err = new Error("child-throw");

    const p = allOf([
        [a, (n) => n > 0],
        [b, (n) => { if (n === 1) throw err; return false; }]
    ]);

    let threwAtWriter = null;
    queueMicrotask(() => {
        try { b.set(1); }
        catch (e) { threwAtWriter = e; }
    });

    await assert.rejects(p, (e) => e === err);
    await new Promise((r) => setTimeout(r, 5));
    dispose(a); dispose(b);

    assert.equal(threwAtWriter, null, "child throw must not surface at the writer");
    assert.equal(stats().effects, before, "all sibling effects must be torn down when one child throws");
});

test("predicate-throw: raceOf rejects with the thrown value (first to settle)", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    const err = new Error("race-child-throw");
    const p = raceOf([
        [a, (n) => n === 99],                                  // never satisfies
        [b, (n) => { if (n === 1) throw err; return false; }]  // throws first
    ]);
    queueMicrotask(() => b.set(1));
    await assert.rejects(p, (e) => e === err);
    await new Promise((r) => setTimeout(r, 5));
    dispose(a); dispose(b);
    assert.equal(stats().effects, before, "raceOf: throwing child must not leak effects");
});

test("predicate-throw: anyOf surfaces a throw via AggregateError when every child throws", async () => {
    // anyOf rejects only when EVERY child rejects -- so a single throwing child
    // (with a still-pending sibling) correctly leaves the bundle pending. Here
    // both children throw, so the bundle rejects with an AggregateError whose
    // `errors` carry the thrown values.
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    const errA = new Error("anyOf-child-a-throw");
    const errB = new Error("anyOf-child-b-throw");
    const p = anyOf([
        [a, (n) => { if (n === 1) throw errA; return false; }],
        [b, (n) => { if (n === 1) throw errB; return false; }]
    ]);
    queueMicrotask(() => { a.set(1); b.set(1); });
    await assert.rejects(p, (e) => {
        assert.ok(e instanceof AggregateError);
        assert.ok(e.errors.includes(errA) && e.errors.includes(errB));
        return true;
    });
    await new Promise((r) => setTimeout(r, 5));
    dispose(a); dispose(b);
    assert.equal(stats().effects, before, "anyOf: throwing children must not leak effects");
});

test("predicate-throw: 1K change-driven throw cycles do not leak", async () => {
    const before = stats().effects;
    const err = new Error("cycle-throw");
    for (let i = 0; i < 1000; i++) {
        const s = signal(0);
        const p = whenSignal(s, (n) => { if (n === 1) throw err; return false; });
        queueMicrotask(() => s.set(1));
        await p.catch(() => {});
        dispose(s);
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before, "1000 throw cycles must return to baseline");
});
