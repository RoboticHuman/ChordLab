import { type Chord, type ChordQuality, QUALITIES, hasMinorThird, parseChordSymbol, qualityFromSymbol } from './chords';
import { type Key, type KeyMode, romanNumeral, scaleNotes } from './keys';
import { type SpelledNote, mod, mod12, pcOf, transpose } from './notes';

/** One chord of a progression, relative to the key so it can be played in any key. */
export interface Step {
  /** Scale degree of the root, 0 = tonic. For secondary chords, the degree within the target's major scale. */
  degree: number;
  /** Semitones above or below that scale degree (♭VII = degree 6, alteration -1 in major). */
  alteration: number;
  quality: ChordQuality;
  /** For secondary chords like V7/ii: the chord being tonicised. */
  of: { degree: number; alteration: number } | null;
}

export interface ProgressionDef {
  id: string;
  name: string;
  mode: KeyMode;
  text: string;
}

export const PROGRESSIONS: readonly ProgressionDef[] = [
  { id: 'ii-V-I', name: 'ii–V–I', mode: 'major', text: 'ii7 V7 Imaj7' },
  { id: 'minor-ii-V-i', name: 'Minor ii–V–i', mode: 'minor', text: 'iiø7 V7 i7' },
  { id: 'I-vi-ii-V', name: 'I–vi–ii–V turnaround', mode: 'major', text: 'Imaj7 vi7 ii7 V7' },
  { id: 'iii-vi-ii-V-I', name: 'iii–vi–ii–V–I', mode: 'major', text: 'iii7 vi7 ii7 V7 Imaj7' },
  { id: 'I-VI7-ii-V', name: 'I–VI7–ii–V (secondary dominant)', mode: 'major', text: 'Imaj7 V7/ii ii7 V7' },
  { id: 'dominant-cycle', name: 'Cycle of dominants', mode: 'major', text: 'V7/vi V7/ii V7/V V7 Imaj7' },
  { id: 'backdoor', name: 'Backdoor ii–V', mode: 'major', text: 'iv7 ♭VII7 Imaj7' },
  { id: 'I-IV-V-I', name: 'I–IV–V–I (triads)', mode: 'major', text: 'I IV V I' },
  { id: 'pop', name: 'I–V–vi–IV (pop)', mode: 'major', text: 'I V vi IV' },
  { id: 'blues', name: 'Blues: I7–IV7–I7–V7–IV7–I7', mode: 'major', text: 'I7 IV7 I7 V7 IV7 I7' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NUMERAL_RE = /^((?:b|♭|#|♯)*)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/u;

const countAccidentals = (s: string) => [...s].reduce((n, c) => n + (c === '#' || c === '♯' ? 1 : -1), 0);

/** "♭VII7" → degree 6, alteration -1, dominant 7th. Case decides major/minor when the suffix doesn't. */
function parseNumeral(text: string): { degree: number; alteration: number; quality: ChordQuality } | null {
  const m = NUMERAL_RE.exec(text);
  if (!m) return null;
  const upper = m[2] === m[2].toUpperCase();
  const suffix = m[3].replace(/b5/g, '♭5').replace(/^o/, '°');
  const byNumeral = QUALITIES.filter((q) => q.numeral === suffix);
  const quality =
    (byNumeral.length === 1 ? byNumeral[0] : byNumeral.find((q) => hasMinorThird(q) === !upper)) ??
    qualityFromSymbol(suffix);
  if (!quality) return null;
  return { degree: ROMAN.indexOf(m[2].toUpperCase()), alteration: countAccidentals(m[1]), quality };
}

/** Parses one chord written as a Roman numeral ("ii7", "V7/V", "♭VII") or a chord name ("Dm7"), relative to `key`. */
export function parseStep(token: string, key: Key): Step {
  const [main, target, ...rest] = token.split('/');
  const numeral = parseNumeral(main);
  if (numeral) {
    if (rest.length) throw new Error(`Too many "/" in "${token}"`);
    if (target === undefined) return { ...numeral, of: null };
    const of = parseNumeral(target);
    if (!of) throw new Error(`Unknown chord "${token}"`);
    return { ...numeral, of: { degree: of.degree, alteration: of.alteration } };
  }
  // A chord name: store it as an interval from the tonic so it transposes with the key.
  const { chord } = parseChordSymbol(token);
  const degree = mod(chord.root.letter - key.tonic.letter, 7);
  const offset = mod12(pcOf(chord.root) - pcOf(scaleNotes(key)[degree]));
  return { degree, alteration: offset > 6 ? offset - 12 : offset, quality: chord.quality, of: null };
}

/** Splits on spaces, commas, bars and arrows (not on "-", which can mean minor, as in "D-7"). */
const tokenize = (text: string) => text.split(/[\s,|→–—]+/u).filter((t) => t && t !== '-');

export function parseProgression(text: string, key: Key): Step[] {
  const tokens = tokenize(text);
  if (!tokens.length) throw new Error('The progression is empty.');
  return tokens.map((t) => parseStep(t, key));
}

function degreeNote(key: Key, degree: number, alteration: number): SpelledNote {
  const base = scaleNotes(key)[degree];
  return { letter: base.letter, accidental: base.accidental + alteration };
}

/** The actual chord a step makes in a key. */
export function realizeStep(step: Step, key: Key): Chord {
  if (!step.of) return { root: degreeNote(key, step.degree, step.alteration), quality: step.quality };
  const tonicised = degreeNote(key, step.of.degree, step.of.alteration);
  const interval = { degree: step.degree + 1, semitones: MAJOR_STEPS[step.degree] + step.alteration };
  return { root: transpose(tonicised, interval), quality: step.quality };
}

export function realizeProgression(steps: readonly Step[], key: Key): Chord[] {
  return steps.map((s) => realizeStep(s, key));
}

/** Writes a progression as Roman numerals for `key`, e.g. to save chord names in a transposable form. */
export function progressionText(steps: readonly Step[], key: Key): string {
  return realizeProgression(steps, key)
    .map((c) => romanNumeral(pcOf(c.root), c.quality, key))
    .join(' ');
}
