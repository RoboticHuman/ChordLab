import { type Chord, hasMinorThird } from '../theory/chords';
import { type Key, type KeyMode, keyFromSignature, keySignature } from '../theory/keys';
import { mod, mod12, noteName, pcOf } from '../theory/notes';
import { s } from './dom';

export interface CirclePathStep {
  chord: Chord;
  label: string;
  state: 'done' | 'current' | 'todo';
}

export interface CircleState {
  key: Key;
  /** The progression in the current key, drawn as a path between wedges. */
  path: CirclePathStep[];
  /** Circle positions (0 = C/Am at the top) of keys already finished in this lap. */
  done: Set<number>;
}

const OUTER = 190;
const MID = 132;
const INNER = 74;
const MAJOR_LABEL = 163;
const MINOR_LABEL = 113;
const PATH_OUTER = 142;
const PATH_INNER = 87;

/** Circle position of a pitch class: each step clockwise is up a 5th (7 semitones). */
const positionOf = (pc: number) => mod12(pc * 7);
/** Signature for a circle position, preferring flats past 6 o'clock. */
const sigAt = (pos: number) => (pos <= 6 ? pos : pos - 12);
const angle = (pos: number) => ((pos * 30 - 90) * Math.PI) / 180;
const point = (pos: number, r: number) => ({ x: Math.cos(angle(pos)) * r, y: Math.sin(angle(pos)) * r });

function wedgePath(pos: number, r1: number, r2: number): string {
  const a0 = angle(pos - 0.5);
  const a1 = angle(pos + 0.5);
  const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `M ${p(a0, r2)} A ${r2} ${r2} 0 0 1 ${p(a1, r2)} L ${p(a1, r1)} A ${r1} ${r1} 0 0 0 ${p(a0, r1)} Z`;
}

function keyLabel(pos: number, mode: KeyMode): string {
  const name = (sig: number) => noteName(keyFromSignature(sig, mode).tonic) + (mode === 'minor' ? 'm' : '');
  return pos === 6 ? `${name(6)}/${name(-6)}` : name(sigAt(pos));
}

/** Where a chord sits on the circle: major-ish chords on the outer ring, minor and diminished on the inner. */
function chordSpot(chord: Chord): { pos: number; r: number } {
  const root = pcOf(chord.root);
  return hasMinorThird(chord.quality) ? { pos: positionOf(root + 3), r: PATH_INNER } : { pos: positionOf(root), r: PATH_OUTER };
}

/** Diatonic Roman numerals around the key's position: IV I V outside, ii vi iii (and vii°) inside. */
const DIATONIC: Record<KeyMode, { outer: string[]; inner: string[] }> = {
  major: { outer: ['IV', 'I', 'V'], inner: ['ii', 'vi', 'iii', 'vii°'] },
  minor: { outer: ['VI', 'III', 'VII'], inner: ['iv', 'i', 'v', 'ii°'] },
};

/** The circle of fifths: majors outside, relative minors inside. Click a wedge to pick that key. */
export class CircleView {
  readonly el: SVGSVGElement;
  onPick: (sig: number, mode: KeyMode) => void = () => {};

  private wedges: { major: SVGPathElement[]; minor: SVGPathElement[] } = { major: [], minor: [] };
  private numerals: { major: SVGTextElement[]; minor: SVGTextElement[] } = { major: [], minor: [] };
  private pathLayer = s('g', { class: 'circle-path' });
  private centerName = s('text', { class: 'circle-center-name', x: 0, y: -2 });
  private centerSig = s('text', { class: 'circle-center-sig', x: 0, y: 22 });

  constructor() {
    this.el = s('svg', { class: 'circle', viewBox: '-200 -200 400 400', role: 'img', 'aria-label': 'Circle of fifths' });
    const defs = s(
      'defs',
      {},
      s(
        'marker',
        { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        s('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'arrow-head' }),
      ),
    );
    this.el.appendChild(defs);
    for (let pos = 0; pos < 12; pos++) {
      for (const mode of ['major', 'minor'] as KeyMode[]) {
        const [r1, r2] = mode === 'major' ? [MID, OUTER] : [INNER, MID];
        const wedge = s('path', { class: `wedge ${mode}`, d: wedgePath(pos, r1, r2) });
        wedge.addEventListener('click', () => this.onPick(sigAt(pos), mode));
        const label = point(pos, mode === 'major' ? MAJOR_LABEL : MINOR_LABEL);
        const numeral = point(pos, mode === 'major' ? OUTER - 10 : MID - 7);
        const numeralEl = s('text', { class: 'wedge-numeral', x: numeral.x, y: numeral.y + 3 });
        this.el.append(
          wedge,
          s('text', { class: `wedge-label ${mode}`, x: label.x, y: label.y + 5 }, keyLabel(pos, mode)),
          numeralEl,
        );
        this.wedges[mode].push(wedge);
        this.numerals[mode].push(numeralEl);
      }
    }
    this.el.append(this.pathLayer, this.centerName, this.centerSig);
  }

  update(state: CircleState): void {
    const sig = keySignature(state.key);
    const home = mod(sig, 12);
    const mode = state.key.mode;
    const diatonic = DIATONIC[mode];

    for (const m of ['major', 'minor'] as KeyMode[]) {
      this.wedges[m].forEach((w, pos) => {
        const offset = mod(pos - home + 1, 12); // 0, 1, 2 for the three wedges around the key
        const inKey = m === 'major' ? offset <= 2 : offset <= 3;
        w.classList.toggle('in-key', inKey);
        w.classList.toggle('current', pos === home && m === mode);
        w.classList.toggle('done', state.done.has(pos) && m === mode);
        this.numerals[m][pos].textContent = inKey ? (m === 'major' ? diatonic.outer : diatonic.inner)[offset] : '';
      });
    }

    this.centerName.textContent = `${noteName(state.key.tonic)}${mode === 'minor' ? 'm' : ''}`;
    this.centerSig.textContent = sig === 0 ? 'no ♯ or ♭' : sig > 0 ? `${sig} ♯` : `${-sig} ♭`;

    this.pathLayer.replaceChildren();
    const spots = state.path.map((p) => chordSpot(p.chord));
    for (let i = 1; i < spots.length; i++) {
      const a = point(spots[i - 1].pos, spots[i - 1].r);
      const b = point(spots[i].pos, spots[i].r);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const trim = 11 / len;
      this.pathLayer.appendChild(
        s('line', {
          class: `path-line ${state.path[i].state}`,
          x1: a.x + (b.x - a.x) * trim,
          y1: a.y + (b.y - a.y) * trim,
          x2: b.x - (b.x - a.x) * trim,
          y2: b.y - (b.y - a.y) * trim,
          'marker-end': 'url(#arrow)',
        }),
      );
    }
    state.path.forEach((p, i) => {
      const c = point(spots[i].pos, spots[i].r);
      this.pathLayer.append(
        s('circle', { class: `path-dot ${p.state}`, cx: c.x, cy: c.y, r: 9 }, s('title', {}, p.label)),
        s('text', { class: 'path-num', x: c.x, y: c.y + 4 }, String(i + 1)),
      );
    });
  }
}
