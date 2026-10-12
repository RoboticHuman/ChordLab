import {
  type Interval,
  type PitchClass,
  type SpelledNote,
  accidentalSymbol,
  mod12,
  noteName,
  parseNote,
  pcOf,
  pcSet,
  pcSetSize,
  pcSetToArray,
  spellPc,
  transpose,
} from './notes';

export type ChordGroup = 'triad' | 'seventh' | 'sixth' | 'ninth';

export interface ChordQuality {
  id: string;
  /** Suffix written after the root: "m7", "maj7", or "" for a major triad. */
  symbol: string;
  name: string;
  group: ChordGroup;
  /** Chord tones from the root upward. */
  tones: Interval[];
  /** Suffix in Roman numeral analysis; upper/lower case comes from the 3rd. */
  numeral: string;
  /** Lower = more common. Picks the best name when the notes fit several chords. */
  rank: number;
}

const iv = (degree: number, semitones: number): Interval => ({ degree, semitones });
const R = iv(1, 0);
const M2 = iv(2, 2);
const m3 = iv(3, 3);
const M3 = iv(3, 4);
const P4 = iv(4, 5);
const d5 = iv(5, 6);
const P5 = iv(5, 7);
const A5 = iv(5, 8);
const M6 = iv(6, 9);
const d7 = iv(7, 9);
const m7 = iv(7, 10);
const M7 = iv(7, 11);
const M9 = iv(9, 14);

export const QUALITIES: readonly ChordQuality[] = [
  { id: 'maj', symbol: '', name: 'major', group: 'triad', tones: [R, M3, P5], numeral: '', rank: 0 },
  { id: 'min', symbol: 'm', name: 'minor', group: 'triad', tones: [R, m3, P5], numeral: '', rank: 0 },
  { id: 'dim', symbol: '°', name: 'diminished', group: 'triad', tones: [R, m3, d5], numeral: '°', rank: 2 },
  { id: 'aug', symbol: '+', name: 'augmented', group: 'triad', tones: [R, M3, A5], numeral: '+', rank: 3 },
  { id: 'sus4', symbol: 'sus4', name: 'suspended 4th', group: 'triad', tones: [R, P4, P5], numeral: 'sus4', rank: 2 },
  { id: 'sus2', symbol: 'sus2', name: 'suspended 2nd', group: 'triad', tones: [R, M2, P5], numeral: 'sus2', rank: 3 },
  { id: 'maj7', symbol: 'maj7', name: 'major 7th', group: 'seventh', tones: [R, M3, P5, M7], numeral: 'maj7', rank: 1 },
  { id: '7', symbol: '7', name: 'dominant 7th', group: 'seventh', tones: [R, M3, P5, m7], numeral: '7', rank: 1 },
  { id: 'm7', symbol: 'm7', name: 'minor 7th', group: 'seventh', tones: [R, m3, P5, m7], numeral: '7', rank: 1 },
  { id: 'm7b5', symbol: 'm7♭5', name: 'half-diminished 7th', group: 'seventh', tones: [R, m3, d5, m7], numeral: 'ø7', rank: 2 },
  { id: 'dim7', symbol: '°7', name: 'diminished 7th', group: 'seventh', tones: [R, m3, d5, d7], numeral: '°7', rank: 2 },
  { id: 'mMaj7', symbol: 'm(maj7)', name: 'minor-major 7th', group: 'seventh', tones: [R, m3, P5, M7], numeral: '(maj7)', rank: 3 },
  { id: '7sus4', symbol: '7sus4', name: 'dominant 7th sus4', group: 'seventh', tones: [R, P4, P5, m7], numeral: '7sus4', rank: 3 },
  { id: '6', symbol: '6', name: 'major 6th', group: 'sixth', tones: [R, M3, P5, M6], numeral: '6', rank: 2 },
  { id: 'm6', symbol: 'm6', name: 'minor 6th', group: 'sixth', tones: [R, m3, P5, M6], numeral: '6', rank: 2 },
  { id: 'add9', symbol: 'add9', name: 'added 9th', group: 'ninth', tones: [R, M3, P5, M9], numeral: 'add9', rank: 3 },
  { id: '9', symbol: '9', name: 'dominant 9th', group: 'ninth', tones: [R, M3, P5, m7, M9], numeral: '9', rank: 2 },
  { id: 'maj9', symbol: 'maj9', name: 'major 9th', group: 'ninth', tones: [R, M3, P5, M7, M9], numeral: 'maj9', rank: 2 },
  { id: 'm9', symbol: 'm9', name: 'minor 9th', group: 'ninth', tones: [R, m3, P5, m7, M9], numeral: '9', rank: 2 },
];

export function qualityById(id: string): ChordQuality {
  const q = QUALITIES.find((q) => q.id === id);
  if (!q) throw new Error(`Unknown chord quality "${id}"`);
  return q;
}

export const hasMinorThird = (q: ChordQuality): boolean =>
  q.tones.some((t) => t.degree === 3 && t.semitones === 3);

/** Index of the perfect 5th among the chord tones, or -1 if the chord has none. */
export const perfectFifthIndex = (q: ChordQuality): number =>
  q.tones.findIndex((t) => t.degree === 5 && t.semitones === 7);

export interface Chord {
  root: SpelledNote;
  quality: ChordQuality;
}

export function chordTones(chord: Chord): SpelledNote[] {
  return chord.quality.tones.map((t) => transpose(chord.root, t));
}

/** Pitch classes in chord-tone order (root, 3rd, 5th, …). */
export function chordPcs(chord: Chord): PitchClass[] {
  const root = pcOf(chord.root);
  return chord.quality.tones.map((t) => mod12(root + t.semitones));
}

export const INVERSION_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'];

/** "E♭maj7", or "E♭maj7/G" when a chord tone other than the root is in the bass. */
export function chordSymbol(chord: Chord, inversion = 0, no5 = false): string {
  const base = noteName(chord.root) + chord.quality.symbol + (no5 ? '(no5)' : '');
  return inversion > 0 ? `${base}/${noteName(chordTones(chord)[inversion])}` : base;
}

/** Interval label relative to the root: R, ♭3, 3, 5, ♭7, 7, 9… */
export function toneLabel(interval: Interval): string {
  if (interval.degree === 1) return 'R';
  const majorSize = [0, 0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21][interval.degree];
  return accidentalSymbol(interval.semitones - majorSize) + interval.degree;
}

/** Stacks the chord tones upward in close position from the given inversion, bass at or above `lowest`. */
export function closeVoicing(chord: Chord, inversion: number, lowest: number): number[] {
  const pcs = chordPcs(chord);
  const order = [...pcs.slice(inversion), ...pcs.slice(0, inversion)];
  const notes: number[] = [];
  let floor = lowest;
  for (const pc of order) {
    const note = floor + mod12(pc - floor);
    notes.push(note);
    floor = note + 1;
  }
  return notes;
}

/**
 * Picks the enharmonic spelling of a root (e.g. C♯ vs D♭) whose chord tones need the
 * fewest accidentals, so you get C♯m and D♭maj7 rather than D♭m (with F♭) or C♯maj7 (with E♯).
 */
export function bestRootSpelling(pc: PitchClass, quality: ChordQuality): SpelledNote {
  const cost = (root: SpelledNote) =>
    quality.tones.reduce((sum, t) => sum + Math.abs(transpose(root, t).accidental), 0);
  const flat = spellPc(pc, 'flats');
  const sharp = spellPc(pc, 'sharps');
  return cost(sharp) < cost(flat) ? sharp : flat;
}

// --- Identification ---

export interface ChordMatch {
  rootPc: PitchClass;
  quality: ChordQuality;
  /** Which chord tone is lowest: 0 = root position, 1 = 1st inversion, … */
  inversion: number;
  /** True when the perfect 5th is left out, as in many jazz voicings. */
  no5: boolean;
}

/** All chord names that fit the notes, best first. Needs at least three distinct pitch classes. */
export function identifyChord(notes: readonly number[]): ChordMatch[] {
  const set = pcSet(notes);
  if (pcSetSize(set) < 3) return [];
  const bassPc = mod12(Math.min(...notes));
  const scored: { match: ChordMatch; score: number }[] = [];
  for (const rootPc of pcSetToArray(set)) {
    for (const quality of QUALITIES) {
      const pcs = quality.tones.map((t) => mod12(rootPc + t.semitones));
      const full = pcSet(pcs);
      let no5 = false;
      if (full !== set) {
        const fifth = perfectFifthIndex(quality);
        if (quality.tones.length < 4 || fifth < 0 || (full & ~(1 << pcs[fifth])) !== set) continue;
        no5 = true;
      }
      const inversion = pcs.indexOf(bassPc);
      const score = quality.rank * 2 + (inversion === 0 ? 0 : 3) + (no5 ? 2 : 0);
      scored.push({ match: { rootPc, quality, inversion, no5 }, score });
    }
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.match);
}

export function matchToChord(match: ChordMatch, spellRoot?: (pc: PitchClass) => SpelledNote): Chord {
  const root = spellRoot ? spellRoot(match.rootPc) : bestRootSpelling(match.rootPc, match.quality);
  return { root, quality: match.quality };
}

// --- Parsing chord symbols ---

/** Common ways of writing each quality, beyond the symbols used for display. */
const SYMBOL_ALIASES: Record<string, string> = {
  M: 'maj', maj: 'maj', major: 'maj',
  min: 'min', mi: 'min', '-': 'min',
  o: 'dim', dim: 'dim',
  aug: 'aug', '#5': 'aug', '♯5': 'aug',
  sus: 'sus4',
  M7: 'maj7', ma7: 'maj7', Maj7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7',
  dom7: '7',
  min7: 'm7', mi7: 'm7', '-7': 'm7',
  m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', '-7b5': 'm7b5', min7b5: 'm7b5',
  o7: 'dim7', dim7: 'dim7',
  mM7: 'mMaj7', mmaj7: 'mMaj7', mMaj7: 'mMaj7', '-Δ7': 'mMaj7', 'm(Δ7)': 'mMaj7',
  '7sus': '7sus4',
  '-6': 'm6', min6: 'm6',
  M9: 'maj9', 'Δ9': 'maj9',
  '-9': 'm9', min9: 'm9',
};

/** The quality written by a suffix such as "m7", "-7", "ø7" or "Δ". Undefined if unknown. */
export function qualityFromSymbol(suffix: string): ChordQuality | undefined {
  const s = suffix.trim();
  return QUALITIES.find((q) => q.symbol === s) ?? QUALITIES.find((q) => q.id === SYMBOL_ALIASES[s]);
}

/** Parses "E♭maj7", "F#m7b5", "Bb7", "C/E" and similar. Throws on anything it does not understand. */
export function parseChordSymbol(text: string): { chord: Chord; bass: SpelledNote | null } {
  const m = /^([A-G](?:bb|b|♭|#|♯|x|𝄪|𝄫)?)([^/]*)(?:\/(.+))?$/u.exec(text.trim());
  const quality = m ? qualityFromSymbol(m[2]) : undefined;
  if (!m || !quality) throw new Error(`Unknown chord "${text}"`);
  return { chord: { root: parseNote(m[1]), quality }, bass: m[3] ? parseNote(m[3]) : null };
}
