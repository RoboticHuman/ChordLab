import './style.css';
import { Synth } from './audio/synth';
import { attachComputerKeyboard, isTyping } from './input/computerKeys';
import { type MidiStatus, connectMidi } from './input/midi';
import { NoteInput } from './input/noteInput';
import { FreePlayMode } from './modes/freePlay';
import type { AppContext, Mode } from './modes/mode';
import { TrainerMode } from './modes/trainer';
import { DEFAULT_SETTINGS, type ModeId, type Settings, Store, getConstraint, getRange } from './state';
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
];

// --- Layout ---

const modeRoot = h('section', { class: 'mode' });
const tabs = MODES.map((m) => h('button', { class: 'tab', onclick: () => settings.update({ mode: m.id }) }, m.title));
const midiPill = h('span', { class: 'pill' });
const soundPill = h('button', {
  class: 'pill',
  onclick: () => (synth.running ? settings.update({ sound: !settings.value.sound }) : synth.unlock()),
});
const octaveHint = h('span');

document.getElementById('app')!.replaceChildren(
  h('header', {}, h('h1', {}, 'Chord Lab'), h('nav', {}, tabs), h('div', { class: 'status' }, midiPill, soundPill)),
  h('main', {}, modeRoot, settingsPanel(settings)),
  h(
    'footer',
    {},
    keyboard.el,
    h(
      'div',
      { class: 'hint' },
      'Play a MIDI keyboard, click the keys, or type ',
      h('kbd', {}, 'A W S E D F T G Y H U J K'),
      ' (computer keys start at ',
      octaveHint,
      '; ',
      h('kbd', {}, 'Z'),
      ' / ',
      h('kbd', {}, 'X'),
      ' change octave).',
    ),
  ),
);

// --- Wiring ---

input.noteOn.on((midi, velocity) => synth.noteOn(midi, velocity));
input.noteOff.on((midi) => synth.noteOff(midi));
input.changed.on((held) => keyboard.setHeld(held));

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
function applySettings(s: Settings): void {
  const range = getRange(s);
  keyboard.setRange(range.low, range.high);
  keyboard.setConstraint(getConstraint(s));
  synth.muted = !s.sound;
  if (latched && !s.latch) input.releaseAll('mouse');
  latched = s.latch;
  renderSoundPill();
  showMode(s.mode);
}
settings.subscribe(applySettings);
applySettings(settings.value);

// Browsers keep audio off until the first click or key press.
const unlock = () => synth.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
synth.onStateChange = renderSoundPill;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !isTyping(e)) input.releaseAll('mouse');
});
// A focused dropdown swallows letter keys, which would stop the computer keyboard from playing notes.
window.addEventListener('change', (e) => {
  if (e.target instanceof HTMLSelectElement) e.target.blur();
});

attachComputerKeyboard(input, (base) => (octaveHint.textContent = midiName(base)));
void connectMidi(input, renderMidiPill);
