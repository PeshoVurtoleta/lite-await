// 07-abort-signal.test.mjs
// AbortSignal is first-class across every primitive. This is the regression
// safety net for the leak class that motivated this library.

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats } from "@zakkster/lite-signal";
import {
    whenSignal, allOf, anyOf, raceOf,
    whenTruthy, whenEquals,
    TimeoutError
} from "../Await.js";

test("AbortSignal: already-aborted signal rejects synchronously across all primitives", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const s = signal("x");

    const candidates = [
        () => whenSignal(s, (v) => v === "x", { signal: ctrl.signal }),
        () => allOf([[s, (v) => v === "x"]], { signal: ctrl.signal }),
        () => anyOf([[s, (v) => v === "x"]], { signal: ctrl.signal }),
        () => raceOf([[s, (v) => v === "x"]], { signal: ctrl.signal }),
        () => whenTruthy(() => true, { signal: ctrl.signal }),
        () => whenEquals(() => 1, 1, { signal: ctrl.signal })
    ];

    for (const fn of candidates) {
        try {
            await fn();
            assert.fail("expected reject for " + fn);
        } catch (e) {
            assert.equal(e.name, "AbortError", "wrong error from " + fn);
        }
    }
});

test("AbortSignal: mid-flight abort cleans up every primitive's effects", async () => {
    const before = stats().effects;
    const ctrl = new AbortController();
    const s1 = signal(0);
    const s2 = signal(0);

    const promises = [
        whenSignal(s1, (n) => n === 1, { signal: ctrl.signal }).catch(() => {}),
        allOf([[s1, (n) => n === 1], [s2, (n) => n === 2]], { signal: ctrl.signal }).catch(() => {}),
        anyOf([[s1, (n) => n === 1], [s2, (n) => n === 2]], { signal: ctrl.signal }).catch(() => {}),
        raceOf([[s1, (n) => n === 1], [s2, (n) => n === 2]], { signal: ctrl.signal }).catch(() => {})
    ];

    setTimeout(() => ctrl.abort(), 10);
    await Promise.all(promises);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(stats().effects, before, "every primitive must clean up on abort");
});

test("AbortSignal: timeout + abort race -- whichever fires first wins", async () => {
    const ctrl = new AbortController();
    const s = signal("x");

    // Abort fires before timeout
    setTimeout(() => ctrl.abort(), 5);
    try {
        await whenSignal(s, (v) => false, { signal: ctrl.signal, timeout: 50 });
        assert.fail("expected reject");
    } catch (e) {
        assert.equal(e.name, "AbortError", "abort should win");
    }
});

test("AbortSignal: timeout fires before abort -- timeout wins", async () => {
    const ctrl = new AbortController();
    const s = signal("x");
    try {
        await whenSignal(s, (v) => false, { signal: ctrl.signal, timeout: 5 });
        assert.fail("expected reject");
    } catch (e) {
        assert.ok(e instanceof TimeoutError, "timeout should win, got " + e.name);
    }
});

test("AbortSignal: 1000 create+abort cycles do not leak effect nodes", async () => {
    const before = stats().effects;
    for (let i = 0; i < 1000; i++) {
        const ctrl = new AbortController();
        const s = signal(0);
        const p = whenSignal(s, (n) => n === 99, { signal: ctrl.signal });
        ctrl.abort();
        await p.catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before, "1000 abort cycles should not leak");
});
