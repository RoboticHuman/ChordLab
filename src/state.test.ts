import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSaved } from './state';

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
