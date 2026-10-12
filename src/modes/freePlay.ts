import { getConstraint, getKey } from '../state';
import {
  type Chord,
  type ChordMatch,
  INVERSION_NAMES,
  chordSymbol,
  chordTones,
  identifyChord,
  perfectFifthIndex,
  toneLabel,
} from '../theory/chords';
import { disallowedNotes } from '../theory/constraint';
import { keyName, romanNumeral } from '../theory/keys';
import { noteName } from '../theory/notes';
import { voiceLeading } from '../theory/voicing';
import { h, render } from '../ui/dom';
import type { KeyMark } from '../ui/keyboard';
import { type Sheet, sheetMusic } from '../ui/sheet';
import { type AppContext, type Mode, chordLabels, noteInKey, playSequence, sheetChord, spellMatch } from './mode';

interface Played {
  notes: number[];
  chord: Chord;
  symbol: string;
  numeral: string;
}

const SETTLE_MS = 400;
const MAX_HISTORY = 16;

/** Play anything: the chord is named live, and held chords build a progression showing how the voices moved. */
export class FreePlayMode implements Mode {
  private cleanup: (() => void)[] = [];
  private history: Played[] = [];
  private settleTimer = 0;
  /** The chord being held right now, before it settles into the progression. */
  private live: { notes: number[]; chord: Chord | null; symbol: string } | null = null;
  private sheet: Sheet | null = null;
  /** Bar being played back, for the sheet highlight. */
  private playing: number | null = null;
  private cancelPlayback = () => {};

  private symbolEl = h('div', { class: 'chord-symbol' });
  private numeralEl = h('div', { class: 'chord-numeral' });
  private descEl = h('div', { class: 'chord-desc' });
  private tonesEl = h('div', { class: 'chord-tones' });
  private altsEl = h('div', { class: 'chord-alts muted' });
  private warningEl = h('div', { class: 'warning' });
  private historyEl = h('div', { class: 'history' });
  private motionEl = h('div', { class: 'motion' });
  private sheetCard = h('div', { class: 'card span-2 sheet-card' });

  constructor(private app: AppContext) {}

  mount(root: HTMLElement): void {
    render(
      root,
      h(
        'div',
        { class: 'mode-grid' },
        h(
          'div',
          { class: 'card chord-card' },
          this.symbolEl,
          this.numeralEl,
          this.descEl,
          this.tonesEl,
          this.altsEl,
          this.warningEl,
        ),
        h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'card-header' },
            h('h3', {}, 'Progression'),
            h('button', { onclick: () => this.playBack() }, '▶ Play back'),
            h('button', { onclick: () => this.clearHistory() }, 'Clear'),
          ),
          this.historyEl,
          this.motionEl,
          h(
            'p',
            { class: 'muted' },
            'Hold a chord for a moment to add it. Arrows show how far your notes moved in total (semitones) and how many stayed put.',
          ),
        ),
        this.sheetCard,
      ),
    );
    this.cleanup.push(
      this.app.input.changed.on((held) => this.update(held)),
      this.app.settings.subscribe(() => {
        this.update(this.app.input.held);
        this.renderHistory();
      }),
    );
    this.update(this.app.input.held);
    this.renderHistory();
  }

  unmount(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.cancelPlayback();
    clearTimeout(this.settleTimer);
    this.app.keyboard.setMarks(new Map());
    this.app.keyboard.setLabels(new Map());
  }

  private update(held: number[]): void {
    const s = this.app.settings.value;
    const key = getKey(s);
    const matches = identifyChord(held);
    const best = matches[0] as ChordMatch | undefined;
    const chord = best ? spellMatch(best, key) : null;

    const outside = disallowedNotes(held, getConstraint(s));
    this.app.keyboard.setMarks(new Map<number, KeyMark>(outside.map((n) => [n, 'bad'])));
    this.app.keyboard.setLabels(chordLabels(held, chord, key));
    this.warningEl.textContent = outside.length
      ? `Outside the allowed notes: ${outside.map((n) => noteInKey(n, key)).join(', ')}`
      : '';

    clearTimeout(this.settleTimer);
    if (!best || !chord) {
      this.symbolEl.textContent = held.length ? held.map((n) => noteInKey(n, key)).join(' ') : '—';
      this.symbolEl.classList.toggle('dim', true);
      this.numeralEl.textContent = '';
      this.descEl.textContent = held.length ? 'Play at least three different notes to make a chord.' : 'Play some notes.';
      render(this.tonesEl);
      this.altsEl.textContent = '';
      this.live = held.length ? { notes: held, chord: null, symbol: '' } : null;
      this.renderSheet();
      return;
    }

    const symbol = chordSymbol(chord, best.inversion, best.no5);
    const numeral = romanNumeral(best.rootPc, best.quality, key);
    this.symbolEl.classList.toggle('dim', false);
    this.symbolEl.textContent = symbol;
    this.numeralEl.textContent = `${numeral} in ${keyName(key)}`;
    const inversion = INVERSION_NAMES[best.inversion] ?? `${best.inversion}th inversion`;
    this.descEl.textContent = `${noteName(chord.root)} ${best.quality.name} · ${inversion}`;

    const fifth = best.no5 ? perfectFifthIndex(best.quality) : -1;
    render(
      this.tonesEl,
      chordTones(chord).map((tone, i) =>
        h(
          'span',
          { class: `tone ${i === fifth ? 'omitted' : ''}`, title: i === fifth ? 'Left out' : '' },
          h('b', {}, noteName(tone)),
          h('small', {}, toneLabel(best.quality.tones[i])),
        ),
      ),
    );
    const alts = matches.slice(1, 4).map((m) => chordSymbol(spellMatch(m, key), m.inversion, m.no5));
    this.altsEl.textContent = alts.length ? `Also could be: ${alts.join(' · ')}` : '';

    this.live = { notes: held, chord, symbol };
    this.renderSheet();
    this.settleTimer = window.setTimeout(() => this.commit({ notes: held, chord, symbol, numeral }), SETTLE_MS);
  }

  private commit(played: Played): void {
    const last = this.history[this.history.length - 1];
    if (last && last.notes.join() === played.notes.join()) return;
    this.history.push(played);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.renderHistory();
  }

  /** The progression so far, plus the chord being held if it hasn't joined the progression yet. */
  private renderSheet(): void {
    const s = this.app.settings.value;
    this.sheetCard.style.display = s.showStaff ? '' : 'none';
    if (!s.showStaff) return;
    const key = getKey(s);
    const bars = this.history.map((p) => sheetChord(p.notes, p.chord, key, p.symbol));
    const last = this.history[this.history.length - 1];
    const liveIsNew = this.live && (!last || last.notes.join() !== this.live.notes.join());
    if (this.live && liveIsNew) bars.push(sheetChord(this.live.notes, this.live.chord, key, this.live.symbol));
    this.sheet = sheetMusic(bars, s.keySig);
    render(this.sheetCard, this.sheet.el);
    this.sheet.highlight(liveIsNew ? bars.length - 1 : null, this.playing);
  }

  private renderHistory(): void {
    const key = getKey(this.app.settings.value);
    this.renderSheet();
    if (!this.history.length) {
      render(this.historyEl, h('span', { class: 'muted' }, 'No chords yet.'));
      render(this.motionEl);
      return;
    }
    render(
      this.historyEl,
      this.history.map((p, i) => {
        const chip = h(
          'button',
          { class: 'chip', title: 'Play this chord', onclick: () => this.play([p], i) },
          h('b', {}, p.symbol),
          h('small', {}, p.numeral),
        );
        if (i === 0) return chip;
        const vl = voiceLeading(this.history[i - 1].notes, p.notes);
        return [
          h(
            'span',
            { class: 'arrow', title: `${vl.distance} semitones moved, ${vl.common.length} notes held` },
            h('span', {}, `${vl.distance}`),
            '→',
            h('small', {}, `${vl.common.length} held`),
          ),
          chip,
        ];
      }),
    );

    const n = this.history.length;
    if (n < 2) {
      render(this.motionEl);
      return;
    }
    const from = this.history[n - 2];
    const to = this.history[n - 1];
    const vl = voiceLeading(from.notes, to.notes);
    render(
      this.motionEl,
      h('div', { class: 'motion-title' }, `${from.symbol} → ${to.symbol}: each voice`),
      h(
        'div',
        { class: 'motion-list' },
        [...vl.motions].reverse().map((m) => {
          const d = m.to - m.from;
          return h(
            'span',
            { class: `motion-item ${d === 0 ? 'held' : ''}` },
            `${noteInKey(m.from, key)} → ${noteInKey(m.to, key)}`,
            h('small', {}, d === 0 ? 'held' : d > 0 ? `+${d}` : `${d}`),
          );
        }),
      ),
    );
  }

  /** Plays chords from the progression (starting at bar `offset`), following along on the sheet. */
  private play(chords: Played[], offset: number): void {
    this.cancelPlayback();
    this.cancelPlayback = playSequence(this.app, chords, (i) => {
      this.playing = i === null ? null : offset + i;
      this.sheet?.highlight(null, this.playing);
    });
  }

  private playBack(): void {
    this.play(this.history, 0);
  }

  private clearHistory(): void {
    this.cancelPlayback();
    this.playing = null;
    this.history = [];
    this.renderHistory();
  }
}
