import { describe, expect, it } from 'vitest';
import { disallowedNotes, presetPcSet } from './constraint';
import { parseMidi } from './notes';
import { smoothestVoicing, voiceLeading, voicings } from './voicing';

const m = (...names: string[]) => names.map(parseMidi);

describe('voicings', () => {
  it('lists every voicing inside a 12-key window', () => {
    // C major within C4–B4: exactly one C, E and G fit, so one voicing.
    expect(voicings([0, 4, 7], 60, 71)).toEqual([m('C4', 'E4', 'G4')]);
    // F3–E4 window: C, E and G each fit once, forcing a 2nd inversion.
    expect(voicings([0, 4, 7], 53, 64)).toEqual([m('G3', 'C4', 'E4')]);
  });

  it('filters by bass note and span', () => {
    const all = voicings([0, 4, 7], 48, 72);
    expect(all.length).toBeGreaterThan(5);
    const firstInv = voicings([0, 4, 7], 48, 72, { bassPc: 4 });
    expect(firstInv.every((v) => v[0] % 12 === 4)).toBe(true);
    expect(voicings([0, 4, 7], 48, 72, { maxSpan: 7 }).every((v) => v[v.length - 1] - v[0] <= 7)).toBe(true);
  });

  it('returns nothing when the chord cannot fit', () => {
    expect(voicings([0, 4, 7], 60, 63)).toEqual([]);
  });
});

describe('voiceLeading', () => {
  it('measures total motion and common tones for ii–V–I shells', () => {
    const dm7 = m('D3', 'F3', 'A3', 'C4');
    const g7 = m('D3', 'F3', 'G3', 'B3');
    const vl = voiceLeading(dm7, g7);
    expect(vl.distance).toBe(3);
    expect(vl.common).toEqual(m('D3', 'F3'));
  });

  it('lets voices split or merge when chord sizes differ', () => {
    const vl = voiceLeading(m('C4', 'E4', 'G4'), m('B3', 'D4', 'F4', 'G4'));
    expect(vl.distance).toBe(1 + 2 + 1 + 0);
    expect(vl.motions).toHaveLength(4);
  });
});

describe('smoothestVoicing', () => {
  it('finds the closest move from the previous chord', () => {
    // From C major (C4 E4 G4) to F major, the smoothest voicing keeps C and moves the others up.
    expect(smoothestVoicing([5, 9, 0], m('C4', 'E4', 'G4'), 48, 84)).toEqual(m('C4', 'F4', 'A4'));
  });

  it('respects the window', () => {
    expect(smoothestVoicing([7, 11, 2], m('C4', 'E4', 'G4'), 60, 71)).toEqual(m('D4', 'G4', 'B4'));
    expect(smoothestVoicing([0, 4, 7], [], 60, 62)).toBeNull();
  });
});

describe('constraints', () => {
  it('checks windows and allowed pitch classes together', () => {
    const constraint = { window: { low: 60, high: 71 }, allowed: presetPcSet('major', 0) };
    expect(disallowedNotes(m('C4', 'E4', 'G4'), constraint)).toEqual([]);
    expect(disallowedNotes(m('C4', 'E♭4', 'G4'), constraint)).toEqual(m('E♭4'));
    expect(disallowedNotes(m('C5'), constraint)).toEqual(m('C5'));
  });
});
