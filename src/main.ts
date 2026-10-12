import './style.css';
import { Synth } from './audio/synth';
import { KEY_LETTERS, attachComputerKeyboard, isTyping } from './input/computerKeys';
import { type MidiStatus, connectMidi } from './input/midi';
import { NoteInput } from './input/noteInput';
import { CircleMode } from './modes/circle';
import { FreePlayMode } from './modes/freePlay';
import type { AppContext, Mode } from './modes/mode';
import { TrainerMode } from './modes/trainer';
import { VoiceLeadingMode } from './modes/voiceLeading';
import {
  DEFAULT_SETTINGS,
  type ModeId,
  type Settings,
  Store,
  computerKeysBase,
  getConstraint,
  getRange,
  octaveShift,
  octaveShowing,
} from './state';
import { midiName } from './theory/notes';
import { h } from './ui/dom';
import { Keyboard } from './ui/keyboard';
import { settingsPanel } from './ui/settingsPanel';

const settings = new Store<Settings>(DEFAULT_SETTINGS, 'chords.settings');
const input = new NoteInput();
const synth = new Synth();
const initialRange = getRange(settings.value);
const keyboard = new Keyboard(initialRange.low, initialRange.high);
const app: AppContext = { input, keyboard, synth, settings };

const MODES: { id: ModeId; title: string; create: () => Mode }[] = [
  { id: 'free', title: 'Free play', create: () => new FreePlayMode(app) },
  { id: 'trainer', title: 'Chord trainer', create: () => new TrainerMode(app) },
  { id: 'circle', title: 'Circle of fifths', create: () => new CircleMode(app) },
  { id: 'voice', title: 'Voice leading', create: () => new VoiceLeadingMode(app) },
];

// --- Layout ---

const modeRoot = h('section', { class: 'mode' });
const tabs = MODES.map((m) => h('button', { class: 'tab', onclick: () => settings.update({ mode: m.id }) }, m.title));
const midiPill = h('span', { class: 'pill' });
const pedalPill = h('span', { class: 'pill live', style: 'display:none' }, 'Pedal');
const settingsToggle = h('button', {
  class: 'pill',
  title: 'Show or hide the settings sidebar',
  onclick: () => settings.update({ settingsOpen: !settings.value.settingsOpen }),
});
const keyboardHint = h(
  'span',
  {},
  'The letters on the piano keys are the computer keys that play them. The ◀ ▶ buttons beside the keyboard ',
  '(or ',
  h('kbd', {}, 'Z'),
  ' / ',
  h('kbd', {}, 'X'),
  ') move it an octave.',
);
/** Shifts the on-screen keyboard (and the computer keys) by octaves. */
const shiftOctave = (by: number) => {
  const s = settings.value;
  settings.update({ octave: octaveShift(s, octaveShift(s) + by) });
};
const octaveDown = h('button', { class: 'octave-btn', onclick: () => shiftOctave(-1) }, '◀');
const octaveUp = h('button', { class: 'octave-btn', onclick: () => shiftOctave(1) }, '▶');
const mainEl = h('main', {}, modeRoot, settingsPanel(settings, keyboardHint));
const soundPill = h('button', {
  class: 'pill',
  onclick: () => (synth.running ? settings.update({ sound: !settings.value.sound }) : synth.unlock()),
});

document.getElementById('app')!.replaceChildren(
  h('header', {}, h('h1', {}, 'Chord Lab'), h('nav', {}, tabs), h('div', { class: 'status' }, pedalPill, midiPill, soundPill, settingsToggle)),
  mainEl,
  h('footer', {}, octaveDown, keyboard.el, octaveUp),
);

// --- Wiring ---

input.noteOn.on((midi, velocity, source) => {
  synth.noteOn(midi, velocity);
  // Follow the MIDI keyboard's octave buttons: bring notes played out of view into view.
  if (source !== 'midi') return;
  const octave = octaveShowing(settings.value, midi);
  if (octave !== octaveShift(settings.value)) settings.update({ octave });
});
input.noteOff.on((midi) => synth.noteOff(midi));
input.changed.on((held) => keyboard.setHeld(held));
input.pedal.on((down) => {
  synth.setSustain(down);
  pedalPill.style.display = down ? '' : 'none';
});

keyboard.onKeyDown = (midi) => (settings.value.latch ? input.toggle(midi, 'mouse') : input.press(midi, 'mouse'));
keyboard.onKeyUp = (midi) => {
  if (!settings.value.latch) input.release(midi, 'mouse');
};

let current: { id: ModeId; mode: Mode } | null = null;
function showMode(id: ModeId): void {
  if (current?.id === id) return;
  current?.mode.unmount();
  const def = MODES.find((m) => m.id === id) ?? MODES[0];
  current = { id: def.id, mode: def.create() };
  current.mode.mount(modeRoot);
  tabs.forEach((tab, i) => tab.classList.toggle('active', MODES[i].id === def.id));
}

function renderSoundPill(): void {
  const s = settings.value;
  soundPill.textContent = !synth.running ? '🔈 Click to enable sound' : s.sound ? '🔊 Sound on' : '🔇 Sound off';
  soundPill.classList.toggle('warn', !synth.running);
  soundPill.title = synth.running
    ? 'Click to turn sound on or off'
    : 'Browsers keep sound off until you click. If it stays off, check the site’s sound/autoplay permission in the address bar.';
}

function renderMidiPill(status: MidiStatus): void {
  const text = {
    unsupported: 'MIDI not supported here (try Chrome or Edge)',
    pending: 'MIDI: connecting…',
    denied: 'MIDI access blocked',
    ready: status.inputs.length ? `MIDI: ${status.inputs.join(', ')}` : 'MIDI: no device connected',
  }[status.state];
  midiPill.textContent = text;
  midiPill.classList.toggle('live', status.state === 'ready' && status.inputs.length > 0);
}

let latched = settings.value.latch;
let keysBase = computerKeysBase(settings.value);
const computerKeys = attachComputerKeyboard(input, () => computerKeysBase(settings.value), shiftOctave);
function applySettings(s: Settings): void {
  mainEl.classList.toggle('no-settings', !s.settingsOpen);
  settingsToggle.textContent = s.settingsOpen ? 'Hide settings' : '⚙ Settings';
  const range = getRange(s);
  keyboard.setRange(range.low, range.high);
  const shift = octaveShift(s);
  octaveDown.disabled = octaveShift(s, shift - 1) === shift;
  octaveUp.disabled = octaveShift(s, shift + 1) === shift;
  octaveDown.title = `Octave down: ${midiName(range.low - 12)}–${midiName(range.high - 12)} (Z)`;
  octaveUp.title = `Octave up: ${midiName(range.low + 12)}–${midiName(range.high + 12)} (X)`;
  const base = computerKeysBase(s);
  if (base !== keysBase) computerKeys.releaseAll();
  keysBase = base;
  keyboard.setLetters(new Map(KEY_LETTERS.map((letter, i) => [base + i, letter])));
  keyboard.setConstraint(getConstraint(s));
  synth.muted = !s.sound;
  input.pedalHolds = s.pedalHolds;
  if (latched && !s.latch) input.releaseAll('mouse');
  latched = s.latch;
  renderSoundPill();
  showMode(s.mode);
}
settings.subscribe(applySettings);
applySettings(settings.value);

// Browsers keep audio off until the first click or key press.
const unlock = () => synth.unlock();
for (const type of ['pointerdown', 'click', 'touchend', 'keydown']) window.addEventListener(type, unlock);
synth.onStateChange = renderSoundPill;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !isTyping(e)) input.releaseAll('mouse');
});
// A focused dropdown swallows letter keys, which would stop the computer keyboard from playing notes.
window.addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement) e.target.blur();
});

void connectMidi(input, renderMidiPill);
