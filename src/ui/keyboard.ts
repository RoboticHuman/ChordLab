import { type NoteConstraint, UNCONSTRAINED, isNoteAllowed } from '../theory/constraint';
import { isBlackKey, midiName, mod12 } from '../theory/notes';
import { s } from './dom';

/** Feedback colouring for a key: right note, wrong note, or a note to play. */
export type KeyMark = 'ok' | 'bad' | 'target';

const WHITE_W = 24;
const WHITE_H = 124;
const BLACK_W = 14;
const BLACK_H = 78;
const TOP = 14; // room for the window bar above the keys

/** An SVG piano keyboard. It only draws; input and modes decide what to show. */
export class Keyboard {
  readonly el: SVGSVGElement;
  onKeyDown: (midi: number) => void = () => {};
  onKeyUp: (midi: number) => void = () => {};

  private low = 0;
  private high = 0;
  private keys = new Map<number, SVGRectElement>();
  private labelEls = new Map<number, SVGTextElement>();
  private octaveEls = new Map<number, SVGTextElement>();
  private windowBar: SVGRectElement | null = null;
  private pointerKey: number | null = null;

  private held: readonly number[] = [];
  private marks = new Map<number, KeyMark>();
  private labels = new Map<number, string>();
  private constraint: NoteConstraint = UNCONSTRAINED;

  constructor(low: number, high: number) {
    this.el = s('svg', { class: 'keyboard', role: 'img', 'aria-label': 'Piano keyboard' });
    this.el.addEventListener('pointerdown', (e) => {
      const midi = Number((e.target as Element).closest('[data-midi]')?.getAttribute('data-midi'));
      if (!Number.isFinite(midi) || e.button !== 0) return;
      e.preventDefault();
      // preventDefault keeps focus where it was; drop it so shortcuts like Esc reach the app.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.el.setPointerCapture(e.pointerId);
      this.pointerKey = midi;
      this.onKeyDown(midi);
    });
    const up = () => {
      if (this.pointerKey === null) return;
      this.onKeyUp(this.pointerKey);
      this.pointerKey = null;
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    this.setRange(low, high);
  }

  get range(): { low: number; high: number } {
    return { low: this.low, high: this.high };
  }

  /** Shows keys low..high, widened if needed so both ends are white keys. */
  setRange(low: number, high: number): void {
    low -= isBlackKey(low) ? 1 : 0;
    high += isBlackKey(high) ? 1 : 0;
    if (low === this.low && high === this.high) return;
    this.low = low;
    this.high = high;
    this.build();
  }

  setHeld(notes: readonly number[]): void {
    this.held = notes;
    this.refresh();
  }

  setMarks(marks: Map<number, KeyMark>): void {
    this.marks = marks;
    this.refresh();
  }

  /** Text drawn on keys; use "\n" for a second, smaller line (e.g. "E♭\n♭3"). */
  setLabels(labels: Map<number, string>): void {
    this.labels = labels;
    this.refresh();
  }

  setConstraint(c: NoteConstraint): void {
    this.constraint = c;
    this.refresh();
  }

  private keyX(midi: number): number {
    let whites = 0;
    for (let m = this.low; m < midi; m++) if (!isBlackKey(m)) whites++;
    return isBlackKey(midi) ? whites * WHITE_W - BLACK_W / 2 : whites * WHITE_W;
  }

  private build(): void {
    this.keys.clear();
    this.labelEls.clear();
    this.octaveEls.clear();
    const whiteCount = Array.from({ length: this.high - this.low + 1 }, (_, i) => this.low + i).filter(
      (m) => !isBlackKey(m),
    ).length;
    const width = whiteCount * WHITE_W;
    this.el.setAttribute('viewBox', `-1 0 ${width + 2} ${TOP + WHITE_H + 2}`);

    const defs = s(
      'defs',
      {},
      s(
        'pattern',
        { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { width: 6, height: 6, class: 'hatch-bg' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }),
      ),
    );
    const whites = s('g');
    const blacks = s('g');
    const octaveLabels = s('g', { class: 'octave-labels' });
    const labels = s('g', { class: 'key-labels' });

    for (let midi = this.low; midi <= this.high; midi++) {
      const black = isBlackKey(midi);
      const x = this.keyX(midi);
      const rect = s('rect', {
        class: `key ${black ? 'black' : 'white'}`,
        x,
        y: TOP,
        width: black ? BLACK_W : WHITE_W,
        height: black ? BLACK_H : WHITE_H,
        rx: 2,
        'data-midi': midi,
      });
      (black ? blacks : whites).appendChild(rect);
      this.keys.set(midi, rect);

      if (mod12(midi) === 0) {
        const label = s('text', { x: x + WHITE_W / 2, y: TOP + WHITE_H - 8 }, midiName(midi));
        octaveLabels.appendChild(label);
        this.octaveEls.set(midi, label);
      }
      const text = s('text', {
        class: black ? 'on-black' : 'on-white',
        x: x + (black ? BLACK_W : WHITE_W) / 2,
        y: TOP + (black ? BLACK_H : WHITE_H) - 8,
      });
      labels.appendChild(text);
      this.labelEls.set(midi, text);
    }

    this.windowBar = s('rect', { class: 'window-bar', y: 2, height: 8, rx: 3 });
    this.el.replaceChildren(defs, this.windowBar, whites, blacks, octaveLabels, labels);
    this.refresh();
  }

  private refresh(): void {
    const held = new Set(this.held);
    for (const [midi, rect] of this.keys) {
      const mark = this.marks.get(midi);
      rect.classList.toggle('held', held.has(midi));
      rect.classList.toggle('off', !isNoteAllowed(midi, this.constraint));
      for (const m of ['ok', 'bad', 'target'] as const) rect.classList.toggle(`mark-${m}`, mark === m);
    }
    for (const [midi, text] of this.labelEls) {
      const [name = '', sub = ''] = (this.labels.get(midi) ?? '').split('\n');
      text.replaceChildren(
        ...(sub ? [s('tspan', { class: 'sub', x: text.getAttribute('x'), dy: -14 }, sub)] : []),
        s('tspan', { x: text.getAttribute('x'), dy: sub ? 14 : 0 }, name),
      );
    }
    for (const [midi, label] of this.octaveEls) label.style.display = this.labels.has(midi) ? 'none' : '';

    const w = this.constraint.window;
    if (this.windowBar) {
      const visible = w && w.high >= this.low && w.low <= this.high;
      this.windowBar.style.display = visible ? '' : 'none';
      if (visible) {
        const lo = Math.max(w.low, this.low);
        const hi = Math.min(w.high, this.high);
        const left = this.keyX(lo);
        const right = this.keyX(hi) + (isBlackKey(hi) ? BLACK_W : WHITE_W);
        this.windowBar.setAttribute('x', String(left));
        this.windowBar.setAttribute('width', String(right - left));
      }
    }
  }
}
