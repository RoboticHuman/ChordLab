import type { NoteInput } from './noteInput';

/** Piano layout on a QWERTY keyboard: home row = white keys, row above = black keys. Uses physical key codes. */
const CODES = [
  'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ',
  'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote',
];

/** True when a key press belongs to a text field or dropdown rather than to the app. */
export const isTyping = (e: Event): boolean =>
  e.target instanceof HTMLElement &&
  e.target.closest('input:not([type=checkbox]):not([type=radio]), select, textarea') !== null;

/** Plays notes from the computer keyboard. Z / X shift the octave; `onOctave` gets the new lowest note. */
export function attachComputerKeyboard(input: NoteInput, onOctave: (base: number) => void): void {
  let base = 60;
  const down = new Map<string, number>();

  const releaseAll = () => {
    for (const midi of down.values()) input.release(midi, 'keys');
    down.clear();
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      releaseAll();
      base = Math.min(96, Math.max(24, base + (e.code === 'KeyZ' ? -12 : 12)));
      onOctave(base);
      return;
    }
    const offset = CODES.indexOf(e.code);
    if (offset < 0 || down.has(e.code)) return;
    down.set(e.code, base + offset);
    input.press(base + offset, 'keys');
  });

  window.addEventListener('keyup', (e) => {
    const midi = down.get(e.code);
    if (midi === undefined) return;
    down.delete(e.code);
    input.release(midi, 'keys');
  });

  // Key-ups are lost when the window loses focus, so let go of everything.
  window.addEventListener('blur', releaseAll);
  onOctave(base);
}
