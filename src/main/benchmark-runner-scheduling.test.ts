// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { settleBenchmarkTasksSequentially } from './benchmark-runner-scheduling';

describe('benchmark runner scheduling', () => {
  it('runs repeat tasks sequentially so benchmark runs do not overlap', async () => {
    const events: string[] = [];

    const results = await settleBenchmarkTasksSequentially([
      async () => {
        events.push('first:start');
        await Promise.resolve();
        events.push('first:end');
        return 'first';
      },
      async () => {
        events.push('second:start');
        await Promise.resolve();
        events.push('second:end');
        return 'second';
      },
    ]);

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'first' },
      { status: 'fulfilled', value: 'second' },
    ]);
  });

  it('keeps running later repeats after one repeat fails', async () => {
    const events: string[] = [];
    const error = new Error('repeat failed');

    const results = await settleBenchmarkTasksSequentially([
      async () => {
        events.push('first');
        throw error;
      },
      async () => {
        events.push('second');
        return 'second';
      },
    ]);

    expect(events).toEqual(['first', 'second']);
    expect(results).toEqual([
      { status: 'rejected', reason: error },
      { status: 'fulfilled', value: 'second' },
    ]);
  });
});
