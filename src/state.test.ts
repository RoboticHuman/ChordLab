import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, computerKeysBase, getRange, mergeSaved, octaveShowing } from './state';

describe('mergeSaved', () => {
  it('uses the defaults when nothing has been saved yet', () => {
    expect(mergeSaved(DEFAULT_SETTINGS, null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSaved(DEFAULT_SETTINGS, 'garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps saved values and fills in settings added since', () => {
    const saved = { keySig: -3, trainer: { roots: 'key' } };
    const merged = mergeSaved(DEFAULT_SETTINGS, saved);
    expect(merged.keySig).toBe(-3);
    expect(merged.trainer.roots).toBe('key');
    expect(merged.trainer.qualities).toEqual(DEFAULT_SETTINGS.trainer.qualities);
    expect(merged.rangeId).toBe(DEFAULT_SETTINGS.rangeId);
  });

  it('drops saved values of the wrong type', () => {
    const merged = mergeSaved(DEFAULT_SETTINGS, { keySig: 'C', windowOn: null, trainer: { qualities: 'maj' } });
    expect(merged.keySig).toBe(DEFAULT_SETTINGS.keySig);
    expect(merged.windowOn).toBe(DEFAULT_SETTINGS.windowOn);
    expect(merged.trainer.qualities).toEqual(DEFAULT_SETTINGS.trainer.qualities);
  });
});

describe('keyboard octave shift', () => {
  const s = (octave: number, rangeId = '49') => ({ ...DEFAULT_SETTINGS, octave, rangeId });

  it('moves the visible keys by octaves, staying on the piano', () => {
    expect(getRange(s(0))).toEqual({ low: 36, high: 84 });
    expect(getRange(s(1))).toEqual({ low: 48, high: 96 });
    expect(getRange(s(9))).toEqual({ low: 60, high: 108 }); // clamped at C8
    expect(getRange(s(-9))).toEqual({ low: 24, high: 72 }); // clamped near A0
    expect(getRange(s(5, '88'))).toEqual({ low: 21, high: 108 });
  });

  it('finds the shift that shows a note played out of view', () => {
    expect(octaveShowing(s(0, '25'), 60)).toBe(0);
    expect(octaveShowing(s(0, '25'), 75)).toBe(1);
    expect(octaveShowing(s(0, '25'), 30)).toBe(-2);
  });

  it('moves the computer keys with it', () => {
    expect(computerKeysBase(s(0))).toBe(60);
    expect(computerKeysBase(s(-1))).toBe(48);
  });
});
