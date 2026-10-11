/** Pitch class: 0 = C, 1 = C♯/D♭ … 11 = B. */
export type PitchClass = number;

/** A set of pitch classes as a 12-bit mask: bit n set ⇒ pitch class n is in the set. */
export type PcSet = number;

export const ALL_PCS: PcSet = 0xfff;

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

export const mod = (n: number, m: number): number => ((n % m) + m) % m;
export const mod12 = (n: number): number => mod(n, 12);

/** A note with explicit spelling, so E♭ and D♯ stay distinct. */
export interface SpelledNote {
  /** Index into LETTERS (0 = C … 6 = B). */
  letter: number;
  /** Semitones of alteration: -1 = ♭, 1 = ♯, ±2 = double flat/sharp. */
  accidental: number;
}

/** An interval as a degree number (1 = unison, 3 = third, 9 = ninth…) plus its size in semitones. */
export interface Interval {
  degree: number;
  semitones: number;
}

export function pcOf(note: SpelledNote): PitchClass {
  return mod12(LETTER_PCS[note.letter] + note.accidental);
}

/** Spells pitch class `pc` on the given letter: spell(1, 3) is D♯, spell(2, 3) is E♭. */
export function spell(letter: number, pc: PitchClass): SpelledNote {
  const l = mod(letter, 7);
  const diff = mod12(pc - LETTER_PCS[l]);
  return { letter: l, accidental: diff > 6 ? diff - 12 : diff };
}

export function transpose(note: SpelledNote, interval: Interval): SpelledNote {
  return spell(note.letter + interval.degree - 1, pcOf(note) + interval.semitones);
}

export type AccidentalPreference = 'flats' | 'sharps' | 'default';

/** Spells a pitch class with no key context. 'default' uses flats except for F♯. */
export function spellPc(pc: PitchClass, prefer: AccidentalPreference = 'default'): SpelledNote {
  const p = mod12(pc);
  const natural = LETTER_PCS.indexOf(p);
  if (natural >= 0) return { letter: natural, accidental: 0 };
  const sharps = prefer === 'sharps' || (prefer === 'default' && p === 6);
  return sharps ? spell(LETTER_PCS.indexOf(p - 1), p) : spell(LETTER_PCS.indexOf(p + 1), p);
}

export function accidentalSymbol(accidental: number): string {
  if (accidental === -2) return '𝄫';
  if (accidental === 2) return '𝄪';
  return accidental < 0 ? '♭'.repeat(-accidental) : '♯'.repeat(accidental);
}

export function noteName(note: SpelledNote): string {
  return LETTERS[note.letter] + accidentalSymbol(note.accidental);
}

/** Parses names like "E♭", "Eb", "F#", "Bbb", "Cx". */
export function parseNote(text: string): SpelledNote {
  const m = /^([A-Ga-g])((?:b|♭|#|♯|x|𝄪|𝄫)*)$/u.exec(text.trim());
  if (!m) throw new Error(`Not a note name: "${text}"`);
  let accidental = 0;
  for (const ch of m[2]) {
    if (ch === 'b' || ch === '♭') accidental -= 1;
    else if (ch === '#' || ch === '♯') accidental += 1;
    else if (ch === 'x' || ch === '𝄪') accidental += 2;
    else if (ch === '𝄫') accidental -= 2;
  }
  return { letter: (LETTERS as readonly string[]).indexOf(m[1].toUpperCase()), accidental };
}

// --- MIDI note numbers (60 = C4 = middle C) ---

export const isBlackKey = (midi: number): boolean => [1, 3, 6, 8, 10].includes(mod12(midi));

/** Octave in scientific pitch notation. Spelling matters at the edges: B♯3 and C4 are both MIDI 60. */
export function octaveOf(midi: number, spelling: SpelledNote = spellPc(midi)): number {
  return Math.floor((midi - spelling.accidental) / 12) - 1;
}

export function midiName(midi: number, spelling: SpelledNote = spellPc(midi)): string {
  return noteName(spelling) + octaveOf(midi, spelling);
}

/** Parses "C4", "Eb3", "F#-1" into a MIDI note number. */
export function parseMidi(text: string): number {
  const m = /^(.+?)(-?\d+)$/.exec(text.trim());
  if (!m) throw new Error(`Not a note with octave: "${text}"`);
  const note = parseNote(m[1]);
  return (Number(m[2]) + 1) * 12 + LETTER_PCS[note.letter] + note.accidental;
}

// --- Pitch-class sets ---

export function pcSet(pcs: Iterable<number>): PcSet {
  let set = 0;
  for (const pc of pcs) set |= 1 << mod12(pc);
  return set;
}

export const pcSetHas = (set: PcSet, pc: PitchClass): boolean => (set & (1 << mod12(pc))) !== 0;

export function pcSetToArray(set: PcSet): PitchClass[] {
  const out: PitchClass[] = [];
  for (let pc = 0; pc < 12; pc++) if (set & (1 << pc)) out.push(pc);
  return out;
}

export const pcSetSize = (set: PcSet): number => pcSetToArray(set).length;

/** True when every pitch class in `inner` is also in `outer`. */
export const pcSetIsSubset = (inner: PcSet, outer: PcSet): boolean => (inner & ~outer) === 0;
