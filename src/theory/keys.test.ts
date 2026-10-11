import { describe, expect, it } from 'vitest';
import { qualityById } from './chords';
import {
  CIRCLE_SIGNATURES,
  type Key,
  diatonicChord,
  keyFromSignature,
  keyName,
  keySignature,
  relativeKey,
  romanNumeral,
  scaleNotes,
  spellInKey,
} from './keys';
import { noteName, parseNote } from './notes';

const key = (tonic: string, mode: Key['mode'] = 'major'): Key => ({ tonic: parseNote(tonic), mode });
const rn = (rootPc: number, quality: string, k: Key) => romanNumeral(rootPc, qualityById(quality), k);

describe('scales and key signatures', () => {
  it('spells scales with one of each letter', () => {
    expect(scaleNotes(key('E♭')).map(noteName)).toEqual(['E♭', 'F', 'G', 'A♭', 'B♭', 'C', 'D']);
    expect(scaleNotes(key('F♯', 'minor')).map(noteName)).toEqual(['F♯', 'G♯', 'A', 'B', 'C♯', 'D', 'E']);
  });

  it('counts sharps and flats', () => {
    expect(keySignature(key('C'))).toBe(0);
    expect(keySignature(key('A'))).toBe(3);
    expect(keySignature(key('D♭'))).toBe(-5);
    expect(keySignature(key('C', 'minor'))).toBe(-3);
  });

  it('walks the circle of fifths', () => {
    expect(CIRCLE_SIGNATURES.map((s) => noteName(keyFromSignature(s, 'major').tonic))).toEqual(
      ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'],
    );
    expect(CIRCLE_SIGNATURES.map((s) => noteName(keyFromSignature(s, 'minor').tonic))).toEqual(
      ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'B♭', 'F', 'C', 'G', 'D'],
    );
    for (const s of CIRCLE_SIGNATURES) expect(keySignature(keyFromSignature(s, 'major'))).toBe(s);
  });

  it('finds relative keys', () => {
    expect(keyName(relativeKey(key('E♭')))).toBe('C minor');
    expect(keyName(relativeKey(key('F♯', 'minor')))).toBe('A major');
  });
});

describe('spellInKey', () => {
  it('uses the scale spelling for diatonic notes', () => {
    expect(noteName(spellInKey(3, key('B♭')))).toBe('E♭');
    expect(noteName(spellInKey(3, key('E')))).toBe('D♯');
  });

  it('spells the raised 7th of a minor key as a sharp', () => {
    expect(noteName(spellInKey(8, key('A', 'minor')))).toBe('G♯');
    expect(noteName(spellInKey(11, key('C', 'minor')))).toBe('B');
  });

  it('follows the key signature for chromatic notes', () => {
    expect(noteName(spellInKey(6, key('B♭')))).toBe('G♭');
    expect(noteName(spellInKey(10, key('E')))).toBe('A♯');
    expect(noteName(spellInKey(1, key('C')))).toBe('D♭');
  });
});

describe('diatonic chords and Roman numerals', () => {
  it('builds diatonic 7th chords', () => {
    const qualities = [0, 1, 2, 3, 4, 5, 6].map((d) => diatonicChord(key('C'), d, true).quality.id);
    expect(qualities).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
    const minor = [0, 1, 2, 3, 4, 5, 6].map((d) => diatonicChord(key('A', 'minor'), d).quality.id);
    expect(minor).toEqual(['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']);
  });

  it('labels diatonic chords', () => {
    const c = key('C');
    expect(rn(2, 'm7', c)).toBe('ii7');
    expect(rn(7, '7', c)).toBe('V7');
    expect(rn(0, 'maj7', c)).toBe('Imaj7');
    expect(rn(11, 'm7b5', c)).toBe('viiø7');
    expect(rn(11, 'dim', c)).toBe('vii°');
  });

  it('labels secondary dominants', () => {
    const c = key('C');
    expect(rn(2, '7', c)).toBe('V7/V');
    expect(rn(9, '7', c)).toBe('V7/ii');
    expect(rn(4, 'maj', c)).toBe('V/vi');
    expect(rn(0, '7', c)).toBe('V7/IV');
  });

  it('labels borrowed and chromatic chords', () => {
    const c = key('C');
    expect(rn(10, 'maj', c)).toBe('♭VII');
    expect(rn(8, 'maj7', c)).toBe('♭VImaj7');
    expect(rn(5, 'min', c)).toBe('iv');
    expect(rn(4, '7', key('A', 'minor'))).toBe('V7');
  });
});
