import { describe, expect, it } from 'vitest';
import { chordSymbol, parseChordSymbol, qualityById } from './chords';
import { type Key, keyFromSignature } from './keys';
import { noteName, parseNote } from './notes';
import { PROGRESSIONS, parseProgression, progressionText, realizeProgression } from './progressions';

const key = (tonic: string, mode: Key['mode'] = 'major'): Key => ({ tonic: parseNote(tonic), mode });
const chords = (text: string, k: Key) => realizeProgression(parseProgression(text, k), k).map((c) => chordSymbol(c));

describe('parseChordSymbol', () => {
  it('reads common spellings of chord names', () => {
    const name = (s: string) => chordSymbol(parseChordSymbol(s).chord);
    expect(name('Dm7')).toBe('Dm7');
    expect(name('Bb7')).toBe('B♭7');
    expect(name('F#m7b5')).toBe('F♯m7♭5');
    expect(name('EbΔ7')).toBe('E♭maj7');
    expect(name('C-7')).toBe('Cm7');
    expect(name('Bø7')).toBe('Bm7♭5');
    expect(name('Go7')).toBe('G°7');
    expect(name('A')).toBe('A');
  });

  it('reads slash bass notes', () => {
    const { chord, bass } = parseChordSymbol('C/E');
    expect(chord.quality).toBe(qualityById('maj'));
    expect(noteName(bass!)).toBe('E');
  });

  it('rejects nonsense', () => {
    expect(() => parseChordSymbol('Cblah')).toThrow();
    expect(() => parseChordSymbol('H7')).toThrow();
  });
});

describe('parseProgression', () => {
  it('realizes Roman numerals in any key', () => {
    expect(chords('ii7 V7 Imaj7', key('C'))).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(chords('ii7 V7 Imaj7', key('E♭'))).toEqual(['Fm7', 'B♭7', 'E♭maj7']);
    expect(chords('ii7 V7 Imaj7', key('F♯'))).toEqual(['G♯m7', 'C♯7', 'F♯maj7']);
  });

  it('uses the key’s own scale in minor keys', () => {
    expect(chords('iiø7 V7 i7', key('A', 'minor'))).toEqual(['Bm7♭5', 'E7', 'Am7']);
    expect(chords('i iv V7 VI', key('C', 'minor'))).toEqual(['Cm', 'Fm', 'G7', 'A♭']);
  });

  it('handles accidentals, secondary dominants and mixed case', () => {
    expect(chords('♭VII7 bVI iv', key('C'))).toEqual(['B♭7', 'A♭', 'Fm']);
    expect(chords('V7/vi V7/ii V7/V V7 I', key('C'))).toEqual(['E7', 'A7', 'D7', 'G7', 'C']);
    expect(chords('V7/ii V7/vi', key('B♭'))).toEqual(['G7', 'D7']);
    expect(chords('viiø7 vii°7 viio', key('C'))).toEqual(['Bm7♭5', 'B°7', 'B°']);
  });

  it('accepts chord names and stores them relative to the key', () => {
    const steps = parseProgression('Dm7, G7 | Cmaj7', key('C'));
    expect(realizeProgression(steps, key('F')).map((c) => chordSymbol(c))).toEqual(['Gm7', 'C7', 'Fmaj7']);
    expect(progressionText(steps, key('C'))).toBe('ii7 V7 Imaj7');
  });

  it('round-trips through Roman numeral text', () => {
    const c = key('C');
    const text = progressionText(parseProgression('Cmaj7 A7 Dm7 G7 Bb7 Fm', c), c);
    expect(text).toBe('Imaj7 V7/ii ii7 V7 ♭VII7 iv');
    expect(chords(text, key('G'))).toEqual(['Gmaj7', 'E7', 'Am7', 'D7', 'F7', 'Cm']);
  });

  it('reports the token it could not read', () => {
    expect(() => parseProgression('ii7 Q7 I', key('C'))).toThrow(/Q7/);
    expect(() => parseProgression('   ', key('C'))).toThrow(/empty/);
  });

  it('parses every built-in progression in every key', () => {
    for (const def of PROGRESSIONS) {
      for (let sig = -6; sig <= 6; sig++) {
        const k = keyFromSignature(sig, def.mode);
        expect(() => realizeProgression(parseProgression(def.text, k), k), `${def.id} in ${sig}`).not.toThrow();
      }
    }
  });
});
