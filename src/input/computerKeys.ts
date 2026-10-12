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

/** The letter printed on each key, in the same order as CODES. */
export const KEY_LETTERS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', ';', "'"];

/**
 * Plays notes from the computer keyboard, starting at `getBase()`. Z / X call `shiftOctave` (the app
 * moves the on-screen keyboard and the base with it).
 */
export function attachComputerKeyboard(
  input: NoteInput,
  getBase: () => number,
  shiftOctave: (by: number) => void,
): { releaseAll: () => void } {
  const down = new Map<string, number>();

  const releaseAll = () => {
    for (const midi of down.values()) input.release(midi, 'keys');
    down.clear();
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      shiftOctave(e.code === 'KeyZ' ? -1 : 1);
      return;
    }
    const offset = CODES.indexOf(e.code);
    if (offset < 0 || down.has(e.code)) return;
    const midi = getBase() + offset;
    down.set(e.code, midi);
    input.press(midi, 'keys');
  });

  window.addEventListener('keyup', (e) => {
    const midi = down.get(e.code);
    if (midi === undefined) return;
    down.delete(e.code);
    input.release(midi, 'keys');
  });

  // Key-ups are lost when the window loses focus, so let go of everything.
  window.addEventListener('blur', releaseAll);
  return { releaseAll };
}
