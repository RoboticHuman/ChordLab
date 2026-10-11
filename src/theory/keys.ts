import { type Chord, type ChordQuality, QUALITIES, hasMinorThird } from './chords';
import {
  type Interval,
  type PcSet,
  type PitchClass,
  type SpelledNote,
  accidentalSymbol,
  mod,
  mod12,
  noteName,
  pcOf,
  pcSet,
  spell,
  spellPc,
  transpose,
} from './notes';

export type KeyMode = 'major' | 'minor';

export interface Key {
  tonic: SpelledNote;
  mode: KeyMode;
}

const STEPS: Record<KeyMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const C: SpelledNote = { letter: 0, accidental: 0 };
const UP_FIFTH: Interval = { degree: 5, semitones: 7 };
const UP_FOURTH: Interval = { degree: 4, semitones: 5 };
const UP_MAJOR_SIXTH: Interval = { degree: 6, semitones: 9 };
const UP_MINOR_THIRD: Interval = { degree: 3, semitones: 3 };

export function scaleNotes(key: Key): SpelledNote[] {
  const tonic = pcOf(key.tonic);
  return STEPS[key.mode].map((step, i) => spell(key.tonic.letter + i, tonic + step));
}

export function scalePcSet(key: Key): PcSet {
  return pcSet(scaleNotes(key).map(pcOf));
}

/** Sharps (positive) or flats (negative) in the key signature: the key's position on the circle of fifths. */
export function keySignature(key: Key): number {
  return scaleNotes(key).reduce((n, note) => n + note.accidental, 0);
}

/** The key with this many sharps (positive) or flats (negative). */
export function keyFromSignature(fifths: number, mode: KeyMode): Key {
  let tonic = C;
  for (let i = 0; i < Math.abs(fifths); i++) tonic = transpose(tonic, fifths > 0 ? UP_FIFTH : UP_FOURTH);
  if (mode === 'minor') tonic = transpose(tonic, UP_MAJOR_SIXTH);
  return { tonic, mode };
}

/** Major keys pair with the minor key a minor 3rd below, and vice versa. */
export function relativeKey(key: Key): Key {
  return key.mode === 'major'
    ? { tonic: transpose(key.tonic, UP_MAJOR_SIXTH), mode: 'minor' }
    : { tonic: transpose(key.tonic, UP_MINOR_THIRD), mode: 'major' };
}

export function keyName(key: Key): string {
  return `${noteName(key.tonic)} ${key.mode}`;
}

/** Key signatures in circle order, from C clockwise: 0, 1♯ … 6♯, 5♭ … 1♭. */
export const CIRCLE_SIGNATURES = [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1];

/** Spells a pitch class the way it is normally written in this key. */
export function spellInKey(pc: PitchClass, key: Key): SpelledNote {
  const p = mod12(pc);
  const diatonic = scaleNotes(key).find((n) => pcOf(n) === p);
  if (diatonic) return diatonic;
  if (key.mode === 'minor') {
    // Raised 6th and 7th from melodic/harmonic minor (F♯ and G♯ in A minor).
    const fromTonic = mod12(p - pcOf(key.tonic));
    if (fromTonic === 11) return spell(key.tonic.letter + 6, p);
    if (fromTonic === 9) return spell(key.tonic.letter + 5, p);
  }
  const sig = keySignature(key);
  return spellPc(p, sig > 0 ? 'sharps' : sig < 0 ? 'flats' : 'default');
}

/** The triad (or 7th chord) built from scale notes on a degree (0 = tonic). */
export function diatonicChord(key: Key, degree: number, sevenths = false): Chord {
  const notes = scaleNotes(key);
  const tones = (sevenths ? [0, 2, 4, 6] : [0, 2, 4]).map((k) => notes[(degree + k) % 7]);
  const rootPc = pcOf(tones[0]);
  const set = pcSet(tones.map(pcOf));
  const group = sevenths ? 'seventh' : 'triad';
  const quality = QUALITIES.find(
    (q) => q.group === group && pcSet(q.tones.map((t) => rootPc + t.semitones)) === set,
  );
  if (!quality) throw new Error(`No ${group} quality for degree ${degree} of ${keyName(key)}`);
  return { root: tones[0], quality };
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function numeral(degree: number, accidental: number, quality: ChordQuality): string {
  const base = NUMERALS[degree];
  return accidentalSymbol(accidental) + (hasMinorThird(quality) ? base.toLowerCase() : base) + quality.numeral;
}

/**
 * Roman numeral for a chord in a key: "ii7", "V7/V" for secondary dominants,
 * "♭VII" or "iv" for chords borrowed from outside the key.
 */
export function romanNumeral(rootPc: PitchClass, quality: ChordQuality, key: Key): string {
  const notes = scaleNotes(key);
  const chordSet = pcSet(quality.tones.map((t) => rootPc + t.semitones));
  const degree = notes.findIndex((n) => pcOf(n) === mod12(rootPc));
  if (degree >= 0 && (chordSet & ~scalePcSet(key)) === 0) return numeral(degree, 0, quality);

  // Secondary dominant: a major or dominant-7th chord a 5th above a diatonic chord other than the tonic.
  if (quality.id === 'maj' || quality.id === '7') {
    const target = notes.findIndex((n) => pcOf(n) === mod12(rootPc + 5));
    if (target > 0) {
      const targetQuality = diatonicChord(key, target).quality;
      if (targetQuality.id !== 'dim') return `V${quality.numeral}/${numeral(target, 0, targetQuality)}`;
    }
  }

  // Chromatic or borrowed chord: number it by the scale degree its letter names, adding ♭ or ♯.
  const root = spellInKey(rootPc, key);
  const deg = mod(root.letter - key.tonic.letter, 7);
  const offset = mod12(rootPc - pcOf(notes[deg]));
  return numeral(deg, offset > 6 ? offset - 12 : offset, quality);
}
