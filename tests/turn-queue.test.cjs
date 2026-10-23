const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTurnQueue } = require("../src/reader/turnQueue.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("rapid turns interrupt animation, retain reversals and serialize renderer moves", async () => {
  const first = gate();
  const calls = [];
  let concurrent = 0,
    maxConcurrent = 0,
    interrupted = false;
  const queue = createTurnQueue(async (direction, operation) => {
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    calls.push({ direction, animate: operation.animate });
    if (calls.length === 1) {
      operation.onInterrupt = () => {
        interrupted = true;
        first.release();
      };
      await first.promise;
    }
    await tick();
    concurrent--;
  });
  const directions = [1, 1, 1, -1, 1, -1, -1, 1];
  await Promise.all(directions.map((direction) => queue.turn(direction)));
  assert.equal(interrupted, true);
  assert.equal(maxConcurrent, 1);
  assert.deepEqual(
    calls.map((call) => call.direction),
    directions,
  );
  assert.equal(calls[0].animate, true);
  assert.ok(calls.slice(1).every((call) => !call.animate));
});

test("a key received during capture still moves once; explicit cancel drops pending turns", async () => {
  for (const cancel of [false, true]) {
    const capture = gate();
    const moved = [];
    let first = true;
    const queue = createTurnQueue(async (direction, operation) => {
      if (first) {
        first = false;
        await capture.promise;
      }
      if (!operation.cancelled) moved.push(direction);
    });
    const requests = [queue.turn(1), queue.turn(-1), queue.turn(1)];
    const stopped = cancel ? queue.cancel() : null;
    capture.release();
    await Promise.all([...requests, stopped]);
    assert.deepEqual(moved, cancel ? [] : [1, -1, 1]);
    await queue.turn(-1);
    assert.equal(moved.at(-1), -1);
  }
});

test("cancel waits for an in-flight render and prevents queued moves after a seek", async () => {
  const render = gate();
  const events = [];
  const queue = createTurnQueue(async (direction) => {
    events.push(direction);
    await render.promise;
    events.push("rendered");
  });
  const first = queue.turn(1);
  const pending = queue.turn(1);
  const navigation = queue.cancel().then(() => {
    events.push("seek");
  });
  await tick();
  assert.deepEqual(events, [1]);
  render.release();
  await Promise.all([first, pending, navigation]);
  assert.deepEqual(events, [1, "rendered", "seek"]);
});

test("renderer failure is reported and subsequent inputs remain usable", async () => {
  let attempts = 0;
  const queue = createTurnQueue(async () => {
    if (++attempts === 1) throw Error("render failed");
  });
  await assert.rejects(queue.turn(1), /render failed/);
  await queue.turn(-1);
  assert.equal(attempts, 2);
});
