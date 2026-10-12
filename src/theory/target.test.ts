import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from './chords';
import { UNCONSTRAINED } from './constraint';
import { noteName, parseMidi, pcOf, transpose } from './notes';
import {
  checkTarget,
  fullTarget,
  guideToneMotion,
  startOptions,
  styleTarget,
  targetVoicings,
  voicingForm,
  withStart,
} from './target';
import { smoothestPath } from './voicing';

const chord = (s: string) => parseChordSymbol(s).chord;
const m = (...names: string[]) => names.map(parseMidi);
const toneNames = (s: string, style: Parameters<typeof styleTarget>[1]) => {
  const t = styleTarget(chord(s), style);
  return t.tones.map((iv) => noteName(transpose(t.chord.root, iv)));
};

describe('styleTarget', () => {
  it('builds shells, guide tones and rootless voicings', () => {
    expect(toneNames('Dm7', 'shell')).toEqual(['D', 'F', 'C']);
    expect(toneNames('G7', 'guide')).toEqual(['B', 'F']);
    expect(toneNames('Dm7', 'rootless')).toEqual(['F', 'A', 'C', 'E']);
    expect(toneNames('G7', 'rootless')).toEqual(['B', 'E', 'F', 'A']);
    expect(toneNames('Cmaj7', 'rootless')).toEqual(['E', 'G', 'B', 'D']);
    expect(toneNames('C6', 'guide')).toEqual(['E', 'A']);
  });

  it('plays triads in full whatever the style', () => {
    expect(toneNames('F', 'rootless')).toEqual(['F', 'A', 'C']);
    expect(styleTarget(chord('F'), 'shell').bass).toEqual([]);
  });

  it('requires the root in the bass for shells', () => {
    const shell = styleTarget(chord('Dm7'), 'shell');
    expect(checkTarget(m('D3', 'C4', 'F4'), shell, UNCONSTRAINED).correct).toBe(true);
    expect(checkTarget(m('F3', 'C4', 'D4'), shell, UNCONSTRAINED).bassWrong).toBe(true);
  });
});

describe('checkTarget', () => {
  const g7 = fullTarget(chord('G7'), null, true);

  it('accepts any voicing and doubled notes', () => {
    expect(checkTarget(m('G2', 'F3', 'B3', 'D4', 'G4'), g7, UNCONSTRAINED).correct).toBe(true);
  });

  it('lets the optional 5th be left out', () => {
    expect(checkTarget(m('G3', 'B3', 'F4'), g7, UNCONSTRAINED).correct).toBe(true);
    expect(checkTarget(m('G3', 'B3', 'F4'), fullTarget(chord('G7')), UNCONSTRAINED).correct).toBe(false);
  });

  it('reports missing and extra notes', () => {
    const check = checkTarget(m('G3', 'B3', 'E4'), g7, UNCONSTRAINED);
    expect(check.correct).toBe(false);
    expect(check.complete).toBe(true);
    expect(check.missing.map((i) => g7.tones[i].degree)).toEqual([7]);
    expect(check.extra).toEqual([4]);
    expect(check.verdict.get(parseMidi('E4'))).toBe(false);
  });

  it('flags notes outside the constraint', () => {
    const constraint = { window: { low: 55, high: 66 }, allowed: 0xfff };
    const check = checkTarget(m('G3', 'B3', 'F4', 'D5'), g7, constraint);
    expect(check.correct).toBe(false);
    expect(check.outside).toEqual(m('D5'));
  });
});

describe('rootless voicings and smoothest paths', () => {
  it('names A and B forms', () => {
    expect(voicingForm(m('F3', 'A3', 'C4', 'E4'), chord('Dm7'))).toBe('A');
    expect(voicingForm(m('F3', 'A3', 'B3', 'E4'), chord('G7'))).toBe('B');
    expect(voicingForm(m('D3', 'F3', 'A3', 'C4'), chord('Dm7'))).toBeNull();
  });

  it('finds the classic A–B–A rootless ii–V–I', () => {
    const targets = ['Dm7', 'G7', 'Cmaj7'].map((s) => styleTarget(chord(s), 'rootless'));
    const options = targets.map((t) => targetVoicings(t, 52, 70, 12));
    const best = smoothestPath(options, { start: m('F3', 'A3', 'C4', 'E4') })!;
    // F A C E → F A B E (C→B) → E G B D (F→E, A→G, E→D).
    expect(best.path[1]).toEqual(m('F3', 'A3', 'B3', 'E4'));
    expect(best.path[2]).toEqual(m('E3', 'G3', 'B3', 'D4'));
    expect(best.distance).toBe(1 + 5);
    expect(best.path.map((v, i) => voicingForm(v, targets[i].chord))).toEqual(['A', 'B', 'A']);
  });

  it('only offers rootless voicings with the 3rd or 7th at the bottom', () => {
    const t = styleTarget(chord('Dm7'), 'rootless');
    const forms = new Set(targetVoicings(t, 48, 72).map((v) => voicingForm(v, t.chord)));
    expect([...forms].sort()).toEqual(['A', 'B']);
    expect(checkTarget(m('C4', 'E4', 'F4', 'A4'), t, UNCONSTRAINED).correct).toBe(true); // B form
    expect(checkTarget(m('E4', 'F4', 'A4', 'C5'), t, UNCONSTRAINED).bassWrong).toBe(true); // 9th at the bottom
  });

  it('returns null when a chord cannot be voiced', () => {
    const t = styleTarget(chord('Cmaj7'), 'full');
    expect(smoothestPath([targetVoicings(t, 60, 62)])).toBeNull();
  });

  it('covers the 5th-less option for full 7th chords', () => {
    const t = fullTarget(chord('G7'), null, true);
    const options = targetVoicings(t, 55, 66);
    expect(options.some((v) => v.length === 3 && !v.some((n) => n % 12 === pcOf(chord('D').root)))).toBe(true);
  });
});

describe('guideToneMotion', () => {
  it('counts guide tones that move by step or stay', () => {
    // Dm7 → G7: F (3rd) stays as the 7th, C (7th) falls a half step to B.
    expect(guideToneMotion(m('D3', 'F3', 'A3', 'C4'), chord('Dm7'), m('D3', 'F3', 'G3', 'B3'))).toEqual({ smooth: 2, total: 2 });
  });

  it('notices leaps', () => {
    // Root-position Dm7 → root-position G7 a 4th higher: F and C both leap.
    expect(guideToneMotion(m('D3', 'F3', 'A3', 'C4'), chord('Dm7'), m('G3', 'B3', 'D4', 'F4'))).toEqual({ smooth: 0, total: 2 });
  });
});

describe('start options', () => {
  it('offers inversions for full chords, A/B forms for rootless, 3rd/7th for guide tones', () => {
    expect(startOptions(fullTarget(chord('Dm7'), null, true)).map((o) => o.label)).toEqual([
      'Root position',
      '1st inversion',
      '2nd inversion',
      '3rd inversion',
    ]);
    expect(startOptions(fullTarget(chord('C'))).length).toBe(3);
    expect(startOptions(fullTarget(chord('C9'))).length).toBe(4); // no 9th in the bass
    expect(startOptions(styleTarget(chord('Dm7'), 'rootless')).map((o) => o.label)).toEqual([
      'A form (3rd lowest)',
      'B form (7th lowest)',
    ]);
    expect(startOptions(styleTarget(chord('G7'), 'guide')).map((o) => o.label)).toEqual(['3rd lowest', '7th lowest']);
    expect(startOptions(styleTarget(chord('G7'), 'shell'))).toEqual([]);
  });

  it('fixes the lowest note, making an optional 5th required when it is the bass', () => {
    const t = fullTarget(chord('G7'), null, true);
    const second = withStart(t, startOptions(t)[2]); // 5th in the bass
    expect(second.optional).toEqual([]);
    expect(checkTarget(m('D3', 'F3', 'G3', 'B3'), second, UNCONSTRAINED).correct).toBe(true);
    expect(checkTarget(m('G3', 'B3', 'D4', 'F4'), second, UNCONSTRAINED).bassWrong).toBe(true);
  });

  it('gives different smooth chains from different starting inversions', () => {
    const chords = ['Dm7', 'G7', 'Cmaj7'].map((s) => fullTarget(chord(s), null, true));
    const chain = (start: number) => {
      const first = withStart(chords[0], startOptions(chords[0])[start]);
      return smoothestPath([first, ...chords.slice(1)].map((t) => targetVoicings(t, 48, 72, 12)))!.path;
    };
    expect(voicingForm(chain(0)[0], chords[0].chord)).toBeNull(); // root position: root lowest
    expect(chain(0)[0][0] % 12).toBe(2); // D
    expect(chain(1)[0][0] % 12).toBe(5); // F
    expect(chain(1)[1][0] % 12).toBe(5); // G7 keeps F in the bass (3rd inversion)
  });
});
