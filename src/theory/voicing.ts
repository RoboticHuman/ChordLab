import { type PitchClass, mod12 } from './notes';

export interface VoicingOptions {
  /** Pitch class that must be the lowest note. */
  bassPc?: PitchClass;
  /** Largest allowed distance from lowest to highest note, in semitones. */
  maxSpan?: number;
}

/** Every way to play each pitch class exactly once using notes in [low, high], each sorted low to high. */
export function voicings(
  pcs: readonly PitchClass[],
  low: number,
  high: number,
  opts: VoicingOptions = {},
): number[][] {
  const candidates = [...new Set(pcs.map(mod12))].map((pc) => {
    const notes: number[] = [];
    for (let n = low + mod12(pc - low); n <= high; n += 12) notes.push(n);
    return notes;
  });
  const out: number[][] = [];
  const picked: number[] = [];
  const visit = (i: number, min: number, max: number) => {
    if (i === candidates.length) {
      if (opts.bassPc === undefined || mod12(min) === mod12(opts.bassPc)) {
        out.push([...picked].sort((a, b) => a - b));
      }
      return;
    }
    for (const n of candidates[i]) {
      const lo = Math.min(min, n);
      const hi = Math.max(max, n);
      if (opts.maxSpan !== undefined && hi - lo > opts.maxSpan) continue;
      picked.push(n);
      visit(i + 1, lo, hi);
      picked.pop();
    }
  };
  if (candidates.length) visit(0, Infinity, -Infinity);
  return out;
}

export interface VoiceMotion {
  from: number;
  to: number;
}

export interface VoiceLeading {
  /** Total semitones moved, summed over every voice. */
  distance: number;
  motions: VoiceMotion[];
  /** Notes held over unchanged. */
  common: number[];
}

/**
 * Connects two voicings with the least total motion. Voices pair up low-to-high when both
 * chords have the same number of notes; otherwise voices may split or merge.
 */
export function voiceLeading(a: readonly number[], b: readonly number[]): VoiceLeading {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  if (!x.length || !y.length) return { distance: 0, motions: [], common: [] };
  const pairs = x.length === y.length ? x.map((n, i): [number, number] => [n, y[i]]) : warpPairs(x, y);
  const motions = pairs.map(([from, to]) => ({ from, to }));
  return {
    distance: motions.reduce((sum, m) => sum + Math.abs(m.to - m.from), 0),
    motions,
    common: x.filter((n) => y.includes(n)),
  };
}

/** Cheapest order-preserving pairing where every note of both chords takes part (dynamic time warping). */
function warpPairs(x: number[], y: number[]): [number, number][] {
  const cost = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(Infinity));
  cost[0][0] = 0;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      cost[i][j] = Math.abs(x[i - 1] - y[j - 1]) + Math.min(cost[i - 1][j - 1], cost[i - 1][j], cost[i][j - 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = x.length;
  let j = y.length;
  while (i > 0 && j > 0) {
    pairs.push([x[i - 1], y[j - 1]]);
    const diag = cost[i - 1][j - 1];
    const up = cost[i - 1][j];
    const left = cost[i][j - 1];
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
  }
  return pairs.reverse();
}

/**
 * The voicing of `pcs` within [low, high] that moves least from `prev`.
 * With no previous chord, picks a compact voicing near the middle of the range.
 */
export function smoothestVoicing(
  pcs: readonly PitchClass[],
  prev: readonly number[],
  low: number,
  high: number,
  opts: VoicingOptions = {},
): number[] | null {
  const options = voicings(pcs, low, high, opts);
  if (!options.length) return null;
  const center = (low + high) / 2;
  const span = (v: number[]) => v[v.length - 1] - v[0];
  const score = prev.length
    ? (v: number[]) => voiceLeading(prev, v).distance * 100 + span(v)
    : (v: number[]) => span(v) * 2 + Math.abs(v.reduce((s, n) => s + n, 0) / v.length - center);
  let best = options[0];
  let bestScore = score(best);
  for (const v of options.slice(1)) {
    const s = score(v);
    if (s < bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}
