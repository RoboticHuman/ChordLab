import { type NoteConstraint, presetPcSet } from './theory/constraint';
import { type Key, type KeyMode, keyFromSignature } from './theory/keys';
import { ALL_PCS, type PcSet, type PitchClass } from './theory/notes';

export type ModeId = 'free' | 'trainer';

export interface TrainerSettings {
  qualities: string[];
  /** All 12 roots, or only chords that are diatonic to the current key. */
  roots: 'all' | 'key';
  /** Accept any voicing, require root position, or ask for a specific inversion. */
  inversions: 'any' | 'root' | 'ask';
  /** Accept 7th and 9th chords without their perfect 5th. */
  allowNo5: boolean;
}

export interface Settings {
  mode: ModeId;
  /** Current key, as a circle-of-fifths position (sharps > 0, flats < 0). Used for spelling and numerals. */
  keySig: number;
  keyMode: KeyMode;
  /** 'all', 'custom', or a PC_PRESETS id. */
  allowedPreset: string;
  allowedTonic: PitchClass;
  allowed: PcSet;
  windowOn: boolean;
  windowLow: number;
  windowSize: number;
  rangeId: string;
  /** Mouse clicks toggle notes on and off, so chords can be built one click at a time. */
  latch: boolean;
  sound: boolean;
  trainer: TrainerSettings;
}

export const RANGES = [
  { id: '25', name: '25 keys (C3–C5)', low: 48, high: 72 },
  { id: '37', name: '37 keys (C3–C6)', low: 48, high: 84 },
  { id: '49', name: '49 keys (C2–C6)', low: 36, high: 84 },
  { id: '61', name: '61 keys (C2–C7)', low: 36, high: 96 },
  { id: '88', name: '88 keys (A0–C8)', low: 21, high: 108 },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'free',
  keySig: 0,
  keyMode: 'major',
  allowedPreset: 'all',
  allowedTonic: 0,
  allowed: ALL_PCS,
  windowOn: false,
  windowLow: 53, // F3–E4: a classic "keep your hand here" window
  windowSize: 12,
  rangeId: '49',
  latch: true,
  sound: true,
  trainer: {
    qualities: ['maj', 'min'],
    roots: 'all',
    inversions: 'any',
    allowNo5: false,
  },
};

export const getKey = (s: Settings): Key => keyFromSignature(s.keySig, s.keyMode);

export function getConstraint(s: Settings): NoteConstraint {
  return {
    window: s.windowOn ? { low: s.windowLow, high: s.windowLow + s.windowSize - 1 } : null,
    allowed: s.allowed,
  };
}

export function getRange(s: Settings): { low: number; high: number } {
  return RANGES.find((r) => r.id === s.rangeId) ?? RANGES[2];
}

/** Recomputes the allowed notes after the preset or its tonic changes. */
export function allowedFor(preset: string, tonic: PitchClass, current: PcSet): PcSet {
  if (preset === 'all') return ALL_PCS;
  if (preset === 'custom') return current;
  return presetPcSet(preset, tonic);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps saved values whose type still matches the defaults, so old saves survive new settings. */
export function mergeSaved<T>(defaults: T, saved: unknown): T {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(saved)) return defaults;
    const out: Record<string, unknown> = { ...defaults };
    for (const k of Object.keys(defaults)) if (k in saved) out[k] = mergeSaved(defaults[k], saved[k]);
    return out as T;
  }
  const sameType =
    saved !== null && typeof saved === typeof defaults && Array.isArray(saved) === Array.isArray(defaults);
  return sameType ? (saved as T) : defaults;
}

/** Observable state, saved to localStorage on every change. */
export class Store<T extends object> {
  private listeners = new Set<(value: T) => void>();
  private state: T;

  constructor(
    defaults: T,
    private readonly storageKey: string,
  ) {
    let saved: unknown = null;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    } catch {
      // Corrupt save: fall back to defaults.
    }
    this.state = mergeSaved(defaults, saved);
  }

  get value(): T {
    return this.state;
  }

  update(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    for (const fn of this.listeners) fn(this.state);
  }

  subscribe(fn: (value: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
