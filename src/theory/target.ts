import { type Chord, perfectFifthIndex } from './chords';
import { type NoteConstraint, disallowedNotes } from './constraint';
import { type Interval, type PitchClass, mod12, pcOf, pcSet, pcSetHas, pcSetSize, pcSetToArray } from './notes';
import { voiceLeading, voicings } from './voicing';

/** Which notes of a chord to play. */
export type VoicingStyle = 'full' | 'shell' | 'guide' | 'rootless';

export const VOICING_STYLES: readonly { id: VoicingStyle; name: string; description: string }[] = [
  {
    id: 'full',
    name: 'Full chord',
    description: 'Every chord tone, in any inversion. The 5th of a 7th chord may be left out.',
  },
  {
    id: 'shell',
    name: 'Shells (R 3 7)',
    description: 'Root in the bass plus the 3rd and 7th: the core of a jazz left hand.',
  },
  {
    id: 'guide',
    name: 'Guide tones (3 7)',
    description: 'Just the 3rd and 7th. These two notes define each chord, and in good voice leading they move by step.',
  },
  {
    id: 'rootless',
    name: 'Rootless (A/B)',
    description:
      'No root: 3-5-7-9 ("A", 3rd at the bottom) or 7-9-3-5 ("B", 7th at the bottom), with the 13th instead of the 5th on dominant chords. Alternating A and B keeps the hand still.',
  },
];

/** A chord plus the way it should be voiced. */
export interface Target {
  chord: Chord;
  /** Intervals above the root to play. */
  tones: Interval[];
  /** Indices into `tones` that may be left out. */
  optional: number[];
  /** Indices into `tones` allowed as the lowest note; empty means any. */
  bass: number[];
}

const iv = (degree: number, semitones: number): Interval => ({ degree, semitones });
const ROOT = iv(1, 0);
const M3 = iv(3, 4);
const m3 = iv(3, 3);
const P4 = iv(4, 5);
const d5 = iv(5, 6);
const P5 = iv(5, 7);
const M6 = iv(6, 9);
const m7 = iv(7, 10);
const M7 = iv(7, 11);
const M9 = iv(9, 14);
const P11 = iv(11, 17);
const M13 = iv(13, 21);

/** Rootless voicing tones by quality id, lowest first in the "A" form. */
const ROOTLESS: Record<string, Interval[]> = {
  maj7: [M3, P5, M7, M9],
  maj9: [M3, P5, M7, M9],
  '6': [M3, P5, M6, M9],
  m7: [m3, P5, m7, M9],
  m9: [m3, P5, m7, M9],
  m6: [m3, P5, M6, M9],
  mMaj7: [m3, P5, M7, M9],
  '7': [M3, M13, m7, M9],
  '9': [M3, M13, m7, M9],
  '7sus4': [P4, P5, m7, M9],
  m7b5: [m3, d5, m7, P11],
};

/** All chord tones; `inversion` fixes the bass. With `allowNo5`, a 7th chord's perfect 5th is optional. */
export function fullTarget(chord: Chord, inversion: number | null = null, allowNo5 = false): Target {
  const tones = chord.quality.tones;
  const fifth = perfectFifthIndex(chord.quality);
  const optional = allowNo5 && fifth >= 0 && tones.length >= 4 && inversion !== fifth ? [fifth] : [];
  return { chord, tones, optional, bass: inversion === null ? [] : [inversion] };
}

/** The 3rd (or the suspended note) and the 7th (or 6th) of a chord, if it has both. */
function guideTones(chord: Chord): [Interval, Interval] | null {
  const tones = chord.quality.tones;
  const third = tones.find((t) => t.degree === 3) ?? tones.find((t) => t.degree === 4 || t.degree === 2);
  const seventh = tones.find((t) => t.degree === 7) ?? tones.find((t) => t.degree === 6);
  return third && seventh ? [third, seventh] : null;
}

/** What to play for `chord` in a voicing style. Chords without a 7th (triads) are always played in full. */
export function styleTarget(chord: Chord, style: VoicingStyle): Target {
  const guides = guideTones(chord);
  if (style === 'full' || !guides) return fullTarget(chord, null, true);
  if (style === 'shell') return { chord, tones: [ROOT, ...guides], optional: [], bass: [0] };
  if (style === 'guide') return { chord, tones: guides, optional: [], bass: [] };
  const rootless = ROOTLESS[chord.quality.id];
  // The 3rd (A form) or the 7th (B form) at the bottom.
  return rootless ? { chord, tones: rootless, optional: [], bass: [0, 2] } : fullTarget(chord, null, true);
}

export function targetPcs(target: Target): PitchClass[] {
  const root = pcOf(target.chord.root);
  return target.tones.map((t) => mod12(root + t.semitones));
}

/** The result of comparing held notes against a target. */
export interface TargetCheck {
  correct: boolean;
  /** Enough different notes are held to count as a real attempt. */
  complete: boolean;
  /** Indices into `target.tones` that are not being played. */
  missing: number[];
  /** Pitch classes held that do not belong. */
  extra: PitchClass[];
  bassWrong: boolean;
  /** Held notes that break the key window or allowed-notes limits. */
  outside: number[];
  /** For each held note: does it belong? */
  verdict: Map<number, boolean>;
}

export function checkTarget(held: readonly number[], target: Target, constraint: NoteConstraint): TargetCheck {
  const pcs = targetPcs(target);
  const all = pcSet(pcs);
  const heldSet = pcSet(held);
  const missing = pcs.flatMap((pc, i) => (!target.optional.includes(i) && !pcSetHas(heldSet, pc) ? [i] : []));
  const extra = pcSetToArray(heldSet).filter((pc) => !pcSetHas(all, pc));
  const lowest = held.length ? Math.min(...held) : null;
  const bassWrong = target.bass.length > 0 && lowest !== null && !target.bass.some((i) => pcs[i] === mod12(lowest));
  const outside = disallowedNotes(held, constraint);
  const verdict = new Map(held.map((n) => [n, pcSetHas(all, n) && !outside.includes(n)]));
  if (bassWrong && lowest !== null) verdict.set(lowest, false);
  return {
    correct: held.length > 0 && !missing.length && !extra.length && !bassWrong && !outside.length,
    complete: pcSetSize(heldSet) >= pcs.length - target.optional.length,
    missing,
    extra,
    bassWrong,
    outside,
    verdict,
  };
}

/** Pitch classes that must be played (everything except optional tones). */
export function requiredPcs(target: Target): PitchClass[] {
  return targetPcs(target).filter((_, i) => !target.optional.includes(i));
}

/** Every voicing of the target inside [low, high], with and without its optional tones. */
export function targetVoicings(target: Target, low: number, high: number, maxSpan?: number): number[][] {
  const pcs = targetPcs(target);
  const sets = target.optional.length ? [pcs, requiredPcs(target)] : [pcs];
  const basses = target.bass.length ? target.bass.map((i) => pcs[i]) : [undefined];
  return sets.flatMap((set) => basses.flatMap((bassPc) => voicings(set, low, high, { bassPc, maxSpan })));
}

/** "A" when the 3rd is lowest, "B" when the 7th is lowest: the two classic rootless positions. */
export function voicingForm(notes: readonly number[], chord: Chord): 'A' | 'B' | null {
  if (!notes.length) return null;
  const guides = guideTones(chord);
  if (!guides) return null;
  const bass = mod12(Math.min(...notes) - pcOf(chord.root));
  if (bass === mod12(guides[0].semitones)) return 'A';
  if (bass === mod12(guides[1].semitones)) return 'B';
  return null;
}

/** Whether an interval is one of the chord's guide tones (3rd/7th, or sus/6th stand-ins). */
export function isGuideTone(chord: Chord, interval: Interval): boolean {
  const guides = guideTones(chord);
  return !!guides && guides.some((g) => g.degree === interval.degree && g.semitones === interval.semitones);
}

/**
 * How the guide tones (3rd and 7th) of the first chord moved into the second: jazz voice leading
 * keeps them to a step (≤ 2 semitones) or a held note, e.g. the 7th of Dm7 (C) falling to the 3rd of G7 (B).
 */
export function guideToneMotion(a: readonly number[], chordA: Chord, b: readonly number[]): { smooth: number; total: number } {
  const guides = guideTones(chordA);
  if (!guides || !a.length || !b.length) return { smooth: 0, total: 0 };
  const root = pcOf(chordA.root);
  const guidePcs = guides.map((g) => mod12(root + g.semitones));
  const { motions } = voiceLeading(a, b);
  let smooth = 0;
  let total = 0;
  for (const n of new Set(a.filter((n) => guidePcs.includes(mod12(n))))) {
    const leap = Math.max(...motions.filter((m) => m.from === n).map((m) => Math.abs(m.to - m.from)));
    total++;
    if (leap <= 2) smooth++;
  }
  return { smooth, total };
}

/** One way to begin a progression: which tone of the first chord is lowest. */
export interface StartOption {
  /** Index into the target's tones. */
  bass: number;
  label: string;
}

const ORDINAL = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'];

/**
 * The ways the first chord of a progression can be started in this voicing style: inversions for full
 * chords, A/B forms for rootless voicings, 3rd or 7th lowest for guide tones. Empty when there is no
 * choice (shells always start from the root).
 */
export function startOptions(target: Target): StartOption[] {
  const candidates = target.bass.length
    ? target.bass
    : target.tones.flatMap((t, i) => (t.degree <= 7 ? [i] : [])); // never a 9th in the bass
  if (candidates.length < 2) return [];
  const full = target.tones === target.chord.quality.tones;
  const rootless = target.tones.some((t) => t.degree > 7);
  return candidates.map((bass) => {
    const tone = target.tones[bass];
    const third = tone.degree <= 4; // the 3rd, or the sus note standing in for it
    let label: string;
    if (full) label = ORDINAL[bass] ?? `${bass}th inversion`;
    else if (rootless) label = third ? 'A form (3rd lowest)' : 'B form (7th lowest)';
    else label = third ? '3rd lowest' : '7th lowest';
    return { bass, label };
  });
}

/** The target with its lowest note fixed (that tone becomes required, even if it was optional). */
export function withStart(target: Target, option: StartOption): Target {
  return { ...target, bass: [option.bass], optional: target.optional.filter((i) => i !== option.bass) };
}
