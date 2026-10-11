import { describe, expect, it } from 'vitest';
import {
  QUALITIES,
  bestRootSpelling,
  chordSymbol,
  chordTones,
  closeVoicing,
  identifyChord,
  matchToChord,
  qualityById,
  toneLabel,
} from './chords';
import { noteName, parseMidi, parseNote } from './notes';

const chord = (root: string, quality: string) => ({ root: parseNote(root), quality: qualityById(quality) });
const notes = (...names: string[]) => names.map(parseMidi);

/** Name of the best match, e.g. "Dm7/C". */
const name = (...names: string[]) => {
  const [best] = identifyChord(notes(...names));
  return best ? chordSymbol(matchToChord(best), best.inversion, best.no5) : null;
};

describe('chord spelling', () => {
  it('spells chord tones with the right letters', () => {
    expect(chordTones(chord('E♭', 'maj7')).map(noteName)).toEqual(['E♭', 'G', 'B♭', 'D']);
    expect(chordTones(chord('F♯', 'm7b5')).map(noteName)).toEqual(['F♯', 'A', 'C', 'E']);
    expect(chordTones(chord('B', 'dim7')).map(noteName)).toEqual(['B', 'D', 'F', 'A♭']);
    expect(chordTones(chord('D♭', '9')).map(noteName)).toEqual(['D♭', 'F', 'A♭', 'C♭', 'E♭']);
  });

  it('writes symbols with slash bass for inversions', () => {
    expect(chordSymbol(chord('C', 'maj'))).toBe('C');
    expect(chordSymbol(chord('E♭', 'maj7'), 1)).toBe('E♭maj7/G');
    expect(chordSymbol(chord('G', '7'), 3)).toBe('G7/F');
  });

  it('labels tones relative to the root', () => {
    expect(qualityById('dim7').tones.map(toneLabel)).toEqual(['R', '♭3', '♭5', '𝄫7']);
    expect(qualityById('9').tones.map(toneLabel)).toEqual(['R', '3', '5', '♭7', '9']);
  });

  it('prefers the enharmonic root with fewer accidentals', () => {
    expect(noteName(bestRootSpelling(1, qualityById('min')))).toBe('C♯');
    expect(noteName(bestRootSpelling(1, qualityById('maj')))).toBe('D♭');
    expect(noteName(bestRootSpelling(8, qualityById('min')))).toBe('G♯');
    expect(noteName(bestRootSpelling(10, qualityById('dim')))).toBe('A♯');
    expect(noteName(bestRootSpelling(3, qualityById('min')))).toBe('E♭');
  });

  it('builds close voicings in any inversion', () => {
    expect(closeVoicing(chord('C', 'maj'), 0, 60)).toEqual([60, 64, 67]);
    expect(closeVoicing(chord('C', 'maj'), 1, 60)).toEqual([64, 67, 72]);
    expect(closeVoicing(chord('G', '7'), 3, 60)).toEqual([65, 67, 71, 74]);
  });
});

describe('identifyChord', () => {
  it('names triads and sevenths in root position', () => {
    expect(name('C4', 'E4', 'G4')).toBe('C');
    expect(name('A3', 'C4', 'E4')).toBe('Am');
    expect(name('D4', 'F4', 'A4', 'C5')).toBe('Dm7');
    expect(name('G3', 'B3', 'D4', 'F4')).toBe('G7');
    expect(name('C4', 'E4', 'G4', 'B4')).toBe('Cmaj7');
    expect(name('B3', 'D4', 'F4', 'A4')).toBe('Bm7♭5');
  });

  it('names inversions with slash chords', () => {
    expect(name('E4', 'G4', 'C5')).toBe('C/E');
    expect(name('G3', 'C4', 'E4')).toBe('C/G');
    expect(name('F3', 'G3', 'B3', 'D4')).toBe('G7/F');
  });

  it('ignores doubled notes and spread voicings', () => {
    expect(name('C3', 'G3', 'E4', 'C5')).toBe('C');
    expect(name('D2', 'C4', 'F4', 'A4')).toBe('Dm7');
  });

  it('resolves 6th vs minor 7th ambiguity by the bass note', () => {
    expect(name('C4', 'E4', 'G4', 'A4')).toBe('C6');
    expect(name('A3', 'C4', 'E4', 'G4')).toBe('Am7');
  });

  it('resolves sus2 vs sus4 by the bass note', () => {
    expect(name('C4', 'D4', 'G4')).toBe('Csus2');
    expect(name('G3', 'C4', 'D4')).toBe('Gsus4');
  });

  it('recognises jazz shells without the 5th', () => {
    expect(name('C4', 'E4', 'B♭4')).toBe('C7(no5)');
    expect(name('D3', 'C4', 'F4')).toBe('Dm7(no5)');
    expect(name('G3', 'F4', 'B4')).toBe('G7(no5)');
  });

  it('prefers a plain triad inversion over a 6th chord missing its 5th', () => {
    expect(name('C4', 'E4', 'A4')).toBe('Am/C');
  });

  it('uses the bass to pick among symmetric diminished 7ths', () => {
    expect(name('C4', 'E♭4', 'G♭4', 'A4')).toBe('C°7');
    // Spelled D♯ F♯ A C rather than E♭ G♭ B𝄫 D𝄫.
    expect(name('E♭4', 'G♭4', 'A4', 'C5')).toBe('D♯°7');
  });

  it('names ninth chords', () => {
    expect(name('C4', 'E4', 'G4', 'B♭4', 'D5')).toBe('C9');
    expect(name('C4', 'E4', 'G4', 'D5')).toBe('Cadd9');
    expect(name('D3', 'F4', 'C5', 'E5')).toBe('Dm9(no5)');
  });

  it('needs at least three pitch classes', () => {
    expect(identifyChord(notes('C4', 'G4', 'C5'))).toEqual([]);
  });

  it('can identify every quality in every inversion', () => {
    for (const quality of QUALITIES) {
      for (let inv = 0; inv < quality.tones.length; inv++) {
        const voicing = closeVoicing({ root: parseNote('D'), quality }, inv, 55);
        const match = identifyChord(voicing).find((m) => m.quality === quality && m.rootPc === 2 && !m.no5);
        expect(match, `${quality.id} inversion ${inv}`).toBeDefined();
        expect(match!.inversion).toBe(inv);
      }
    }
  });
});
