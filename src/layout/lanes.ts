export interface LaneAssignment {
  /** Lane index per input extent (same order as the input array). */
  lanes: number[];
  laneCount: number;
}

/**
 * Greedy first-fit lane packing over px extents `[x0, x1]`. Input order is preserved
 * (callers pass chronologically sorted events); an extent lands in the first lane
 * whose last occupant ends at least `minGap` px before it, else opens a new lane.
 */
export function assignLanes(
  extents: ReadonlyArray<readonly [number, number]>,
  minGap = 8,
): LaneAssignment {
  const lastEnd: number[] = [];
  const lanes: number[] = [];

  for (const [x0, x1] of extents) {
    let lane = lastEnd.findIndex((end) => x0 >= end + minGap);
    if (lane === -1) {
      lane = lastEnd.length;
      lastEnd.push(x1);
    } else {
      lastEnd[lane] = x1;
    }
    lanes.push(lane);
  }
  return { lanes, laneCount: lastEnd.length };
}
