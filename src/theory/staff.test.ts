import { describe, expect, it } from 'vitest';
import { parseNote } from './notes';
import { keySignatureNotes, printedAccidental } from './staff';

describe('key signatures', () => {
  it('lists sharps and flats in the order they are written', () => {
    expect(keySignatureNotes(2).map((n) => n.letter)).toEqual([3, 0]); // F♯ C♯
    expect(keySignatureNotes(-3).map((n) => n.letter)).toEqual([6, 2, 5]); // B♭ E♭ A♭
  });

  it('prints only the accidentals the key signature does not cover', () => {
    expect(printedAccidental(parseNote('F♯'), 1)).toBeNull();
    expect(printedAccidental(parseNote('F'), 1)).toBe(0); // natural sign
    expect(printedAccidental(parseNote('B♭'), 0)).toBe(-1);
    expect(printedAccidental(parseNote('E♭'), -3)).toBeNull();
    expect(printedAccidental(parseNote('E'), -3)).toBe(0);
    expect(printedAccidental(parseNote('C𝄪'), 2)).toBe(2);
  });
});
