import { describe, expect, it } from 'vitest';
import { createLatestQueue } from './queue.ts';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let settled promises run their callbacks. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A queue whose runs are resolved by hand: `pending.get(req)` settles request `req`. */
function setup() {
  const started: number[] = [];
  const pending = new Map<number, Deferred<string>>();
  const delivered: [string, number][] = [];
  const queue = createLatestQueue<number, string>(
    (req) => {
      started.push(req);
      const d = deferred<string>();
      pending.set(req, d);
      return d.promise;
    },
    (res, req) => delivered.push([res, req]),
  );
  const settle = async (req: number): Promise<void> => {
    pending.get(req)?.resolve(`r${req}`);
    await flush();
  };
  return { queue, started, pending, delivered, settle };
}

describe('createLatestQueue', () => {
  it('runs a request and delivers its result', async () => {
    const { queue, started, delivered, settle } = setup();
    expect(queue.busy).toBe(false);
    queue.push(1);
    expect(started).toEqual([1]);
    expect(queue.busy).toBe(true);
    await settle(1);
    expect(delivered).toEqual([['r1', 1]]);
    expect(queue.busy).toBe(false);
  });

  it('runs one request at a time; newer pushes replace the waiting one', async () => {
    const { queue, started, delivered, settle } = setup();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(started).toEqual([1]);
    await settle(1);
    // 2 was superseded before it could start.
    expect(started).toEqual([1, 3]);
    await settle(3);
    expect(delivered).toEqual([
      ['r1', 1],
      ['r3', 3],
    ]);
    expect(queue.busy).toBe(false);
  });

  // Regression E2.17: the old queue dropped every in-flight result while a newer request was
  // waiting, so a steadily moving pointer never got any feedback.
  it('keeps delivering at the completion rate while requests arrive faster', async () => {
    const { queue, started, delivered, settle } = setup();
    let next = 0;
    queue.push(next++);
    for (let round = 0; round < 5; round++) {
      // Three pointer moves per pick.
      queue.push(next++);
      queue.push(next++);
      queue.push(next++);
      await settle(started[started.length - 1] as number);
    }
    expect(delivered).toHaveLength(5);
    expect(delivered.map(([, req]) => req)).toEqual(started.slice(0, 5));
    // The last push always resolves and is delivered.
    const last = next - 1;
    expect(started[started.length - 1]).toBe(last);
    await settle(last);
    expect(delivered[delivered.length - 1]).toEqual([`r${last}`, last]);
    expect(queue.busy).toBe(false);
  });

  it('cancel drops the waiting request and the running result', async () => {
    const { queue, started, delivered, settle } = setup();
    queue.push(1);
    queue.push(2);
    queue.cancel();
    await settle(1);
    expect(delivered).toEqual([]);
    expect(started).toEqual([1]);
    expect(queue.busy).toBe(false);
  });

  it('delivers requests started after a cancel', async () => {
    const { queue, started, delivered, settle } = setup();
    queue.push(1);
    queue.cancel();
    queue.push(2);
    await settle(1);
    // 1 is stale; 2 was waiting and starts now.
    expect(delivered).toEqual([]);
    expect(started).toEqual([1, 2]);
    await settle(2);
    expect(delivered).toEqual([['r2', 2]]);
  });

  it('keeps going after a rejected run, delivering nothing for it', async () => {
    const { queue, started, pending, delivered, settle } = setup();
    queue.push(1);
    queue.push(2);
    pending.get(1)?.reject(new Error('lost context'));
    await flush();
    expect(delivered).toEqual([]);
    expect(started).toEqual([1, 2]);
    await settle(2);
    expect(delivered).toEqual([['r2', 2]]);
  });

  it('treats a synchronous throw in run like a rejection', async () => {
    const delivered: number[] = [];
    const queue = createLatestQueue<number, number>(
      (req) => {
        if (req === 1) throw new Error('boom');
        return Promise.resolve(req * 10);
      },
      (res) => delivered.push(res),
    );
    queue.push(1);
    queue.push(2);
    await flush();
    expect(delivered).toEqual([20]);
    expect(queue.busy).toBe(false);
  });

  it('delivers nothing after dispose and ignores later pushes', async () => {
    const { queue, started, delivered, settle } = setup();
    queue.push(1);
    queue.push(2);
    queue.dispose();
    await settle(1);
    queue.push(3);
    expect(delivered).toEqual([]);
    expect(started).toEqual([1]);
    expect(queue.busy).toBe(false);
  });
});
