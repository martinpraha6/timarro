import { describe, expect, it } from 'vitest';
import { assignLanes } from './lanes';

describe('assignLanes', () => {
  it('keeps non-overlapping extents in lane 0', () => {
    const { lanes, laneCount } = assignLanes([
      [0, 100],
      [120, 200],
      [220, 300],
    ]);
    expect(lanes).toEqual([0, 0, 0]);
    expect(laneCount).toBe(1);
  });

  it('stacks overlapping extents into new lanes', () => {
    const { lanes, laneCount } = assignLanes([
      [0, 100],
      [50, 150],
      [60, 90],
    ]);
    expect(lanes).toEqual([0, 1, 2]);
    expect(laneCount).toBe(3);
  });

  it('respects the minimum gap', () => {
    expect(
      assignLanes(
        [
          [0, 100],
          [104, 200],
        ],
        8,
      ).lanes,
    ).toEqual([0, 1]); // 4px gap < 8
    expect(
      assignLanes(
        [
          [0, 100],
          [110, 200],
        ],
        8,
      ).lanes,
    ).toEqual([0, 0]); // 10px gap ≥ 8
  });

  it('reuses freed lanes (first fit)', () => {
    const { lanes, laneCount } = assignLanes([
      [0, 100], // lane 0
      [50, 80], // lane 1
      [200, 300], // lane 0 again
      [210, 260], // lane 1 again
    ]);
    expect(lanes).toEqual([0, 1, 0, 1]);
    expect(laneCount).toBe(2);
  });
});
