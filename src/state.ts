import { type NoteConstraint, presetPcSet } from './theory/constraint';
import { type Key, type KeyMode, keyFromSignature } from './theory/keys';
import { ALL_PCS, type PcSet, type PitchClass, mod12, pcOf, pcSetTranspose } from './theory/notes';
import { PROGRESSIONS, type Step, parseProgression } from './theory/progressions';
import type { VoicingStyle } from './theory/target';

export type ModeId = 'free' | 'trainer' | 'circle' | 'voice';

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
  /** Show held or played chords as sheet music. */
  showStaff: boolean;
  /** Notes held by the sustain pedal count as held for chord detection, not just for sound. */
  pedalHolds: boolean;
  trainer: TrainerSettings;
  /** A PROGRESSIONS id, or 'custom'. Shared by the circle and voice-leading modes. */
  progressionId: string;
  /** The custom progression, as Roman numerals, and the mode it is written for. */
  customProgression: string;
  customMode: KeyMode;
  /** Circle mode: 'fourths' goes C → F → B♭ (anticlockwise), 'fifths' goes C → G → D. */
  circleDirection: 'fourths' | 'fifths';
  /** Circle mode: move the allowed notes along with the key. */
  circleMovesAllowed: boolean;
  voiceStyle: VoicingStyle;
  /** Voice-leading mode shows the sheet music or the voice-lines graph. */
  voiceView: 'sheet' | 'lines';
  /** Circle and voice-leading modes: mark the next chord's suggested voicing on the keyboard. */
  lightNext: boolean;
  /** The settings sidebar is open. */
  settingsOpen: boolean;
  /** Circle and voice-leading modes: how the first chord starts (an index into its start options), -1 for any. */
  startFrom: number;
  /** Move to the next start option with each new key. */
  rotateStart: boolean;
  /** On-screen keyboard (and computer keys) shifted this many octaves from the keyboard size's default. */
  octave: number;
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
  showStaff: true,
  pedalHolds: false,
  trainer: {
    qualities: ['maj', 'min'],
    roots: 'all',
    inversions: 'any',
    allowNo5: false,
  },
  progressionId: 'ii-V-I',
  customProgression: 'Imaj7 vi7 ii7 V7',
  customMode: 'major',
  circleDirection: 'fourths',
  circleMovesAllowed: true,
  voiceStyle: 'full',
  voiceView: 'sheet',
  lightNext: false,
  settingsOpen: true,
  startFrom: -1,
  rotateStart: false,
  octave: 0,
};

export const getKey = (s: Settings): Key => keyFromSignature(s.keySig, s.keyMode);

export function getConstraint(s: Settings): NoteConstraint {
  return {
    window: s.windowOn ? { low: s.windowLow, high: s.windowLow + s.windowSize - 1 } : null,
    allowed: s.allowed,
  };
}

const keyboardSize = (s: Settings) => RANGES.find((r) => r.id === s.rangeId) ?? RANGES[2];

/** The octave shift actually in effect: the setting, kept within the 88 piano keys. */
export function octaveShift(s: Settings, octave = s.octave): number {
  const size = keyboardSize(s);
  return Math.max(Math.ceil((21 - size.low) / 12), Math.min(Math.floor((108 - size.high) / 12), octave));
}

/** The keys shown on screen: the keyboard size, shifted by octaves. */
export function getRange(s: Settings): { low: number; high: number } {
  const size = keyboardSize(s);
  const shift = octaveShift(s) * 12;
  return { low: size.low + shift, high: size.high + shift };
}

/** The octave shift that keeps a note in view, or the current one if it already is. */
export function octaveShowing(s: Settings, midi: number): number {
  const { low, high } = getRange(s);
  const shift = octaveShift(s);
  if (midi < low) return octaveShift(s, shift - Math.ceil((low - midi) / 12));
  if (midi > high) return octaveShift(s, shift + Math.ceil((midi - high) / 12));
  return shift;
}

/** Where the computer keys start: C4 moved by the octave shift. */
export const computerKeysBase = (s: Settings): number => 60 + 12 * octaveShift(s);

/** Wraps a key signature into -6..6 (going past 6♯ comes back round as flats). */
export function wrapSignature(sig: number): number {
  let s = sig;
  while (s > 6) s -= 12;
  while (s < -6) s += 12;
  return s;
}

/** The signature of the same tonic in another mode: C major (0) ↔ C minor (-3). */
export function parallelSignature(sig: number, from: KeyMode, to: KeyMode): number {
  return from === to ? sig : wrapSignature(sig + (to === 'minor' ? -3 : 3));
}

/** A settings patch that changes key, optionally transposing the allowed notes by the same interval. */
export function keyChange(s: Settings, keySig: number, keyMode: KeyMode, moveAllowed: boolean): Partial<Settings> {
  const patch: Partial<Settings> = { keySig, keyMode };
  if (moveAllowed && s.allowedPreset !== 'all') {
    const shift = pcOf(keyFromSignature(keySig, keyMode).tonic) - pcOf(getKey(s).tonic);
    patch.allowed = pcSetTranspose(s.allowed, shift);
    patch.allowedTonic = mod12(s.allowedTonic + shift);
  }
  return patch;
}

export interface ResolvedProgression {
  name: string;
  /** The mode the progression is written for. */
  mode: KeyMode;
  text: string;
  steps: Step[];
  error: string | null;
}

/** The selected progression, parsed for the current key. */
export function getProgression(s: Settings): ResolvedProgression {
  const def = PROGRESSIONS.find((p) => p.id === s.progressionId);
  const name = def?.name ?? 'Custom';
  const mode = def?.mode ?? s.customMode;
  const text = def?.text ?? s.customProgression;
  try {
    return { name, mode, text, steps: parseProgression(text, getKey(s)), error: null };
  } catch (e) {
    return { name, mode, text, steps: [], error: (e as Error).message };
  }
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
