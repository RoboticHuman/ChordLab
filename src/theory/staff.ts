import type { SpelledNote } from './notes';

export type Clef = 'treble' | 'bass';

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** The letters a key signature sharpens (positive sig) or flattens (negative), in the order they are written. */
export function keySignatureNotes(sig: number): { letter: number; accidental: number }[] {
  const count = Math.min(7, Math.abs(sig));
  return Array.from({ length: count }, (_, i) =>
    sig > 0 ? { letter: SHARP_ORDER[i], accidental: 1 } : { letter: FLAT_ORDER[i], accidental: -1 },
  );
}

/** The accidental to print before a note in this key (0 = natural sign), or null if the key signature covers it. */
export function printedAccidental(note: SpelledNote, sig: number): number | null {
  const fromKey = keySignatureNotes(sig).find((k) => k.letter === note.letter)?.accidental ?? 0;
  return note.accidental === fromKey ? null : note.accidental;
}
