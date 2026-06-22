// 04-race-of.test.mjs
// raceOf: first settlement wins (success OR failure).

import { test } from "node:test";
import assert from "node:assert/strict";
import { signal, stats } from "@zakkster/lite-signal";
import { raceOf, TimeoutError } from "../Await.js";

test("raceOf: first to satisfy wins with {index, value}", async () => {
    const a = signal(0), b = signal(0);
    const p = raceOf([
        [a, (n) => n === 7],
        [b, (n) => n === 9]
    ]);
    setTimeout(() => a.set(7), 5);
    const r = await p;
    assert.equal(r.index, 0);
    assert.equal(r.value, 7);
});

test("raceOf: success vs error pattern -- error path wins", async () => {
    // Common Twitch/API pattern: race a success signal against an error signal.
    const response = signal(null);
    const error = signal(null);
    const p = raceOf([
        [response, (r) => r !== null],
        [error,    (e) => e !== null]
    ]);
    setTimeout(() => error.set("EBS rejected"), 5);
    const r = await p;
    assert.equal(r.index, 1);
    assert.equal(r.value, "EBS rejected");
});

test("raceOf: success vs error -- success wins when faster", async () => {
    const response = signal(null);
    const error = signal(null);
    const p = raceOf([
        [response, (r) => r !== null],
        [error,    (e) => e !== null]
    ]);
    setTimeout(() => response.set({ ok: true }), 5);
    const r = await p;
    assert.equal(r.index, 0);
    assert.deepEqual(r.value, { ok: true });
});

test("raceOf: timeout rejects the bundle", async () => {
    const a = signal(0);
    try {
        await raceOf([[a, (n) => n === 1]], { timeout: 20 });
        assert.fail("expected timeout");
    } catch (e) {
        assert.ok(e instanceof TimeoutError);
    }
});

test("raceOf: cleans up losing specs on win", async () => {
    const before = stats().effects;
    const a = signal(0), b = signal(0);
    const p = raceOf([
        [a, (n) => n === 1],
        [b, (n) => n === 2]
    ]);
    setTimeout(() => a.set(1), 5);
    await p;
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});

test("raceOf: AbortSignal cleans up all specs", async () => {
    const before = stats().effects;
    const ctrl = new AbortController();
    const a = signal(0), b = signal(0);
    const p = raceOf([
        [a, (n) => n === 1],
        [b, (n) => n === 2]
    ], { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    try { await p; } catch {}
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(stats().effects, before);
});
