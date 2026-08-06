// The headless audio shim used to hand-list its methods and fell behind the real api,
// which killed every `--shot` boot with "audio.horn is not a function". It is a Proxy now.
// This asserts the two properties that fix depends on. Node has no window, so
// createAudio() returns the shim here without a browser.
//
//   node tools/_audio-shim-check.mjs
import assert from 'node:assert/strict';
import { createAudio } from '../game/audio.js';

const a = createAudio({ enabled: false });

// 1. Any name the api might grow answers as a callable no-op.
for (const k of ['horn', 'pass', 'crash', 'boostReady', 'noteGrind', 'somethingAddedIn2027']) {
  assert.equal(typeof a[k], 'function', `shim must answer ${k}() as a function`);
  assert.equal(a[k]({ side: 1 }), undefined, `${k}() must return undefined`);
}

// 2. It must NOT look thenable, or `await audio` anywhere would hang forever.
assert.equal(a.then, undefined, 'shim must not expose `then`');
assert.equal(await Promise.resolve(a), a, 'awaiting the shim must resolve to the shim');

// 3. The members whose return value is load-bearing keep their real values.
assert.equal(a.prewarm(), -1);
assert.equal(a.getVolume(), 0);
assert.equal(a.addRival(), null);
assert.equal(a.info().mode, 'noop');
assert.equal(a.running, false);
assert.equal(a.ctx, null);
assert.equal(await a.ready, false);

console.log('audio shim ok');
