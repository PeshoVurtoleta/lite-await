// 08-statechart.test.mjs
// whenStatechart: lite-statechart specialization. Tests work with both a
// hand-rolled duck-typed mock AND a real lite-statechart instance (when
// available in the package's node_modules; otherwise the real test is skipped).

import { test } from "node:test";
import assert from "node:assert/strict";
import { whenStatechart, TimeoutError } from "../Await.js";

// Hand-rolled mock conforming to the duck-typed interface.
function makeMockMachine(initial) {
    let state = initial;
    const listeners = [];
    return {
        get _state() { return state; },
        transition(next, ev) {
            const from = state;
            state = next;
            for (const fn of listeners) fn(from, next, ev || "EVENT", null);
        },
        state: { peek: () => state },
        onTransition(fn) {
            listeners.push(fn);
            return () => {
                const i = listeners.indexOf(fn);
                if (i >= 0) listeners.splice(i, 1);
            };
        },
        _listenerCount() { return listeners.length; }
    };
}

test("whenStatechart: resolves when machine enters target state", async () => {
    const m = makeMockMachine("idle");
    const p = whenStatechart(m, "ready");
    setTimeout(() => m.transition("ready", "GO"), 5);
    await p;
});

test("whenStatechart: resolves synchronously when already in target", async () => {
    const m = makeMockMachine("ready");
    await whenStatechart(m, "ready");
});

test("whenStatechart: timeout rejects", async () => {
    const m = makeMockMachine("idle");
    try {
        await whenStatechart(m, "ready", { timeout: 15 });
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
    }
});

test("whenStatechart: AbortSignal aborts", async () => {
    const ctrl = new AbortController();
    const m = makeMockMachine("idle");
    setTimeout(() => ctrl.abort(), 5);
    try {
        await whenStatechart(m, "ready", { signal: ctrl.signal });
        assert.fail("expected abort");
    } catch (e) {
        assert.equal(e.name, "AbortError");
    }
});

test("whenStatechart: unsubscribes the listener on every settlement path", async () => {
    const m = makeMockMachine("idle");

    // 1. settle via target
    const p1 = whenStatechart(m, "ready");
    assert.equal(m._listenerCount(), 1);
    m.transition("ready", "GO");
    await p1;
    assert.equal(m._listenerCount(), 0, "listener leak after resolve");

    m.transition("idle", "RESET");

    // 2. settle via timeout
    const p2 = whenStatechart(m, "ready", { timeout: 10 });
    assert.equal(m._listenerCount(), 1);
    try { await p2; } catch {}
    assert.equal(m._listenerCount(), 0, "listener leak after timeout");

    // 3. settle via abort
    const ctrl = new AbortController();
    const p3 = whenStatechart(m, "ready", { signal: ctrl.signal });
    assert.equal(m._listenerCount(), 1);
    ctrl.abort();
    try { await p3; } catch {}
    assert.equal(m._listenerCount(), 0, "listener leak after abort");
});

test("whenStatechart: rejects TypeError for non-machine input", async () => {
    try {
        await whenStatechart(null, "ready");
        assert.fail("expected reject");
    } catch (e) {
        assert.ok(e instanceof TypeError);
    }
    try {
        await whenStatechart({}, "ready");
        assert.fail("expected reject");
    } catch (e) {
        assert.ok(e instanceof TypeError);
    }
});

test("whenStatechart: rejects TypeError for non-string stateName", async () => {
    const m = makeMockMachine("idle");
    try {
        await whenStatechart(m, 42);
        assert.fail("expected reject");
    } catch (e) {
        assert.ok(e instanceof TypeError);
    }
});

// Real lite-statechart integration (best-effort; skip if not installed).
let createStatechart = null;
try {
    const mod = await import("@zakkster/lite-statechart");
    createStatechart = mod.createStatechart;
} catch {}

test(
    "whenStatechart: works with a real lite-statechart machine",
    { skip: createStatechart === null },
    async () => {
        const m = createStatechart({
            initial: "idle",
            states: {
                idle:     { on: { GO: "loading" } },
                loading:  { on: { OK: "ready", FAIL: "error" } },
                ready:    {},
                error:    {}
            }
        });
        const p = whenStatechart(m, "ready");
        setTimeout(() => { m.send("GO"); m.send("OK"); }, 5);
        await p;
        assert.equal(m.state.peek(), "ready");
        m.dispose();
    }
);
