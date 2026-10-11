import { describe, expect, it } from 'vitest';
import {
  midiName,
  noteName,
  parseMidi,
  parseNote,
  pcOf,
  pcSet,
  pcSetIsSubset,
  pcSetToArray,
  spell,
  spellPc,
  transpose,
} from './notes';

const n = parseNote;

describe('spelling', () => {
  it('parses and prints note names', () => {
    for (const name of ['C', 'E♭', 'F♯', 'B𝄫', 'C𝄪']) expect(noteName(n(name))).toBe(name);
    expect(noteName(n('Eb'))).toBe('E♭');
    expect(noteName(n('f#'))).toBe('F♯');
    expect(noteName(n('Bbb'))).toBe('B𝄫');
    expect(() => n('H')).toThrow();
  });

  it('computes pitch classes, wrapping around B/C', () => {
    expect(pcOf(n('C'))).toBe(0);
    expect(pcOf(n('B♯'))).toBe(0);
    expect(pcOf(n('C♭'))).toBe(11);
    expect(pcOf(n('E♭'))).toBe(pcOf(n('D♯')));
  });

  it('spells a pitch class on a given letter', () => {
    expect(noteName(spell(1, 3))).toBe('D♯');
    expect(noteName(spell(2, 3))).toBe('E♭');
    expect(noteName(spell(6, 0))).toBe('B♯');
  });

  it('spells black keys with flats by default, except F♯', () => {
    expect([1, 3, 6, 8, 10].map((pc) => noteName(spellPc(pc)))).toEqual(['D♭', 'E♭', 'F♯', 'A♭', 'B♭']);
    expect(noteName(spellPc(6, 'flats'))).toBe('G♭');
    expect(noteName(spellPc(1, 'sharps'))).toBe('C♯');
  });

  it('transposes by spelled intervals', () => {
    const fifth = { degree: 5, semitones: 7 };
    expect(noteName(transpose(n('B♭'), fifth))).toBe('F');
    expect(noteName(transpose(n('F♯'), fifth))).toBe('C♯');
    expect(noteName(transpose(n('E'), { degree: 3, semitones: 4 }))).toBe('G♯');
    expect(noteName(transpose(n('E♭'), { degree: 3, semitones: 3 }))).toBe('G♭');
  });
});

describe('MIDI', () => {
  it('names and parses MIDI notes with middle C = C4 = 60', () => {
    expect(midiName(60)).toBe('C4');
    expect(midiName(61)).toBe('D♭4');
    expect(midiName(21)).toBe('A0');
    expect(parseMidi('C4')).toBe(60);
    expect(parseMidi('Eb3')).toBe(51);
    expect(parseMidi('A0')).toBe(21);
  });

  it('keeps the written octave for enharmonic spellings across B/C', () => {
    expect(midiName(60, n('B♯'))).toBe('B♯3');
    expect(midiName(59, n('C♭'))).toBe('C♭4');
    expect(parseMidi('B#3')).toBe(60);
    expect(parseMidi('Cb4')).toBe(59);
  });
});

describe('pitch-class sets', () => {
  it('folds octaves together', () => {
    expect(pcSetToArray(pcSet([60, 64, 67, 72, 76]))).toEqual([0, 4, 7]);
  });

  it('tests subsets', () => {
    const cMajor = pcSet([0, 2, 4, 5, 7, 9, 11]);
    expect(pcSetIsSubset(pcSet([0, 4, 7]), cMajor)).toBe(true);
    expect(pcSetIsSubset(pcSet([0, 3, 7]), cMajor)).toBe(false);
  });
});
