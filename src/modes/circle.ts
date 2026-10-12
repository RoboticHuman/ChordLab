import { isTyping } from '../input/computerKeys';
import { type Settings, getConstraint, getKey, getProgression, keyChange, wrapSignature } from '../state';
import { type Chord, chordSymbol } from '../theory/chords';
import { keyFromSignature, keyName, keySignature, romanNumeral } from '../theory/keys';
import { mod, pcOf } from '../theory/notes';
import { realizeProgression } from '../theory/progressions';
import { type Target, checkTarget, fullTarget, startOptions } from '../theory/target';
import { CircleView } from '../ui/circleView';
import { h, render } from '../ui/dom';
import { type Sheet, sheetMusic } from '../ui/sheet';
import {
  type AppContext,
  type Mode,
  chordLabels,
  demoRange,
  describeCheck,
  paintKeys,
  playAndShow,
  playSequence,
  playabilityProblem,
  playableRange,
  sheetChord,
  suggestRoute,
  suggestVoicing,
} from './mode';
import {
  type Carry,
  ProgressionRunner,
  applyStart,
  displayVoicings,
  nextStart,
  playedSymbol,
  progressionPicker,
  startPicker,
} from './progression';

interface KeyResult {
  key: string;
  ms: number;
  moved: number;
  smoothest: number;
}

const LAP = 12;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const clock = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** Play a progression, then the same progression in the next key around the circle, all twelve keys. */
export class CircleMode implements Mode {
  private cleanup: (() => void)[] = [];
  private view = new CircleView();
  private picker!: ReturnType<typeof progressionPicker>;
  private start!: ReturnType<typeof startPicker>;
  /** The progression's chords as targets, before the start inversion is applied. */
  private baseTargets: Target[] = [];
  /** The start option the current key was built with. */
  private startUsed = -1;
  private runner: ProgressionRunner | null = null;
  private chords: Chord[] = [];
  private results: KeyResult[] = [];
  private doneKeys = new Set<number>();
  private lapStartedAt = 0;
  private keyStartedAt = 0;
  /** The last chord played, carried into the next key so the voice leading continues. */
  private carry: Carry | null = null;
  /** Notes shown by "Show me". */
  private revealed: number[] = [];
  /** The next chord's suggested voicing, marked on the keyboard when "light up" is on. */
  private suggested: number[] = [];
  /** The latest verdict on the held notes, and the chord they were judged against. */
  private heldVerdict: Map<number, boolean> | null = null;
  private heldChord: Chord | null = null;
  /** "Hear progression": the voicings being played and the bar sounding now. */
  private playback: { path: number[][]; index: number | null } | null = null;
  private cancelPlayback = () => {};
  private sheet: Sheet | null = null;
  /** Identifies what the current lap was built from, to tell our own key changes from the user's. */
  private lapSource = '';
  private currentKeyId = '';
  private advancingTo: string | null = null;
  /** Why the current key can't be finished (a chord ruled out by the limits), if so. */
  private problem: string | null = null;
  private badTimer = 0;

  private titleEl = h('div', { class: 'key-title' });
  private statusEl = h('div', { class: 'prompt-label' });
  private chordsEl = h('div', { class: 'progression-row' });
  private feedbackEl = h('div', { class: 'feedback' });
  /** Lasting problems with the exercise itself, kept apart from feedback on what you play. */
  private warningEl = h('div', { class: 'warning' });
  private resultsEl = h('div', { class: 'results' });
  private sheetCard = h('div', { class: 'card sheet-card' });
  private directionSelect = h(
    'select',
    { onchange: () => this.app.settings.update({ circleDirection: this.directionSelect.value as Settings['circleDirection'] }) },
    h('option', { value: 'fourths' }, 'down a 5th (C → F → B♭)'),
    h('option', { value: 'fifths' }, 'up a 5th (C → G → D)'),
  );
  private moveAllowedEl = h('input', {
    type: 'checkbox',
    onchange: () => this.app.settings.update({ circleMovesAllowed: this.moveAllowedEl.checked }),
  });
  private lightNextEl = h('input', {
    type: 'checkbox',
    onchange: () => this.app.settings.update({ lightNext: this.lightNextEl.checked }),
  });

  constructor(private app: AppContext) {}

  mount(root: HTMLElement): void {
    this.picker = progressionPicker(this.app);
    this.start = startPicker(this.app);
    this.view.onPick = (sig, mode) => this.app.settings.update(keyChange(this.settings, sig, mode, false));
    render(
      root,
      h(
        'div',
        { class: 'mode-grid circle-grid' },
        h(
          'div',
          { class: 'col' },
          h(
            'div',
            { class: 'card circle-card' },
            this.view.el,
            h(
              'p',
              { class: 'muted' },
              'Majors outside, relative minors inside. Shaded: the chords of the current key. Click a wedge to start there.',
            ),
          ),
          h('div', { class: 'card' }, h('h3', {}, 'This lap'), this.resultsEl),
        ),
        h(
          'div',
          { class: 'col' },
          h(
            'div',
            { class: 'card chord-card' },
            h(
              'div',
              { class: 'options-bar' },
              h(
                'div',
                { class: 'row' },
                this.picker.el,
                h('label', { class: 'row' }, h('span', { class: 'muted' }, 'Next key'), this.directionSelect),
              ),
              h(
                'div',
                { class: 'row' },
                this.start.el,
                h('label', { class: 'check', title: 'Transpose the allowed notes along with each key change' }, this.moveAllowedEl, 'Allowed notes follow the key'),
                h('label', { class: 'check' }, this.lightNextEl, 'Light up next chord'),
              ),
            ),
            this.statusEl,
            this.titleEl,
            this.chordsEl,
            this.warningEl,
            this.feedbackEl,
            h(
              'div',
              { class: 'row buttons' },
              h('button', { onclick: () => this.hearProgression() }, '▶ Hear progression'),
              h('button', { onclick: () => this.hearChord(), title: 'Shortcut: Space' }, 'Hear chord'),
              h('button', { onclick: () => this.reveal() }, 'Show me'),
              h('button', { onclick: () => this.skipChord() }, 'Skip chord'),
              h('button', { onclick: () => this.resetLap() }, 'Restart lap'),
            ),
          ),
          this.sheetCard,
        ),
      ),
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e)) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.hearChord();
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKey),
      this.app.input.changed.on((held) => this.evaluate(held)),
      this.app.settings.subscribe(() => this.onSettings()),
    );
    this.syncOptions();
    this.resetLap();
  }

  unmount(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.cancelPlayback();
    clearTimeout(this.badTimer);
    this.app.keyboard.setMarks(new Map());
    this.app.keyboard.setLabels(new Map());
  }

  private get settings(): Settings {
    return this.app.settings.value;
  }

  private sourceId(s: Settings): string {
    return `${s.progressionId}|${getProgression(s).text}`;
  }

  private onSettings(): void {
    const s = this.settings;
    this.picker.sync();
    this.syncOptions();
    const keyId = `${s.keySig}:${s.keyMode}`;
    if (this.sourceId(s) !== this.lapSource) this.resetLap();
    else if (keyId !== this.currentKeyId) {
      if (keyId === this.advancingTo) this.startKey();
      else this.resetLap();
    } else if (s.startFrom !== this.startUsed) {
      this.startKey(); // a different start inversion: replay this key from the top
    } else {
      this.evaluate(this.app.input.held);
      this.renderAll();
    }
  }

  private syncOptions(): void {
    const s = this.settings;
    this.directionSelect.value = s.circleDirection;
    this.moveAllowedEl.checked = s.circleMovesAllowed;
    this.lightNextEl.checked = s.lightNext;
  }

  // --- Flow ---

  private resetLap(): void {
    this.results = [];
    this.doneKeys = new Set();
    this.lapStartedAt = performance.now();
    this.lapSource = this.sourceId(this.settings);
    this.startKey();
  }

  private startKey(): void {
    const s = this.settings;
    const key = getKey(s);
    const progression = getProgression(s);
    this.advancingTo = null;
    this.currentKeyId = `${s.keySig}:${s.keyMode}`;
    this.chords = realizeProgression(progression.steps, key);
    this.baseTargets = this.chords.map((c) => fullTarget(c, null, true));
    this.startUsed = s.startFrom;
    this.runner = progression.error ? null : new ProgressionRunner(applyStart(this.baseTargets, s.startFrom), this.carry);
    this.revealed = [];
    this.stopPlayback();
    this.keyStartedAt = performance.now();
    this.setFeedback('', '');
    this.renderAll();
    this.evaluate(this.app.input.held);
  }

  private nextSignature(s: Settings): number {
    return wrapSignature(s.keySig + (s.circleDirection === 'fifths' ? 1 : -1));
  }

  private evaluate(held: number[]): void {
    clearTimeout(this.badTimer);
    const runner = this.runner;
    const s = this.settings;
    const key = getKey(s);
    if (!runner || runner.finished) {
      this.app.keyboard.setMarks(new Map());
      this.app.keyboard.setLabels(chordLabels(held, null, key));
      return;
    }
    const { check, solved } = runner.feed(held, getConstraint(s), playableRange(s));
    const target = solved ? runner.targets[runner.index - 1] : runner.current!;
    if (solved) this.revealed = [];
    if (check) {
      this.heldVerdict = check.verdict;
      this.heldChord = target.chord;
    }
    this.paint();

    if (solved) {
      const r = runner.results[runner.results.length - 1];
      let text = `✓ ${chordSymbol(target.chord)}`;
      if (r.moved !== null) {
        text += ` · moved ${r.moved}`;
        text += r.smoothest !== null && r.smoothest < r.moved ? ` (smoothest: ${r.smoothest})` : ' (smoothest!)';
      }
      this.setFeedback('ok', text);
      if (runner.finished) this.finishKey();
      else this.renderAll();
    } else if (check?.complete) {
      // Wait a moment: the notes of a chord arrive one by one, and the rest may be on the way.
      const text = describeCheck(check, target, held, key, getConstraint(s));
      this.badTimer = window.setTimeout(() => this.setFeedback('bad', text), 250);
    } else this.clearError();
  }

  private finishKey(): void {
    const runner = this.runner!;
    const s = this.settings;
    const key = getKey(s);
    const ms = performance.now() - this.keyStartedAt;
    const moved = runner.results.reduce((sum, r) => sum + (r.moved ?? 0), 0);
    const smoothest = runner.results.reduce((sum, r) => sum + (r.smoothest ?? 0), 0);
    this.results.push({ key: keyName(key), ms, moved, smoothest });
    this.doneKeys.add(mod(keySignature(key), 12));

    if (this.results.length >= LAP) {
      this.renderAll();
      this.setFeedback('ok', `Full circle! All ${LAP} keys in ${clock(performance.now() - this.lapStartedAt)}.`);
      return;
    }
    this.carry = runner.carry;
    const next = this.nextSignature(s);
    const message = `✓ ${keyName(key)} done in ${seconds(ms)}. Now ${keyName(keyFromSignature(next, s.keyMode))}.`;
    this.advancingTo = `${next}:${s.keyMode}`;
    this.app.settings.update({
      ...keyChange(s, next, s.keyMode, s.circleMovesAllowed),
      startFrom: nextStart(this.baseTargets, s),
    });
    if (!this.problem) this.setFeedback('ok', message);
  }

  // --- Hints ---

  /** Suggested voicings for the chords not played yet, continuing from the last one played. */
  private continuation(): number[][] {
    const runner = this.runner;
    if (!runner) return [];
    const s = this.settings;
    const start = runner.previous.length ? runner.previous : undefined;
    return suggestRoute(runner.targets.slice(runner.index), demoRange(s), s.allowed, start);
  }

  /** Says why a hint can't be played instead of silently doing nothing. */
  private cantPlay(targets: readonly Target[]): void {
    const s = this.settings;
    const why = playabilityProblem(targets, demoRange(s), s.allowed, getKey(s)) ?? 'no voicing fits';
    this.setFeedback('bad', `Can’t play that: ${why}.`);
  }

  private hearChord(): void {
    const target = this.runner?.current;
    if (!target) return;
    const s = this.settings;
    const notes = suggestVoicing(target, this.runner!.previous, demoRange(s), s.allowed);
    if (notes) playAndShow(this.app, notes, target.chord);
    else this.cantPlay([target]);
  }

  private reveal(): void {
    const target = this.runner?.current;
    if (!target) return;
    const s = this.settings;
    const notes = suggestVoicing(target, this.runner!.previous, demoRange(s), s.allowed);
    if (!notes) return this.cantPlay([target]);
    this.revealed = notes;
    playAndShow(this.app, notes, target.chord);
    this.paint();
  }

  private skipChord(): void {
    const runner = this.runner;
    if (!runner?.current) return;
    runner.skip();
    this.revealed = [];
    this.heldVerdict = null;
    this.setFeedback('', '');
    this.paint();
    if (runner.finished) this.finishKey();
    else this.renderAll();
  }

  private hearProgression(): void {
    if (!this.runner) return;
    const s = this.settings;
    const path = suggestRoute(this.runner.targets, demoRange(s), s.allowed);
    if (!path.some((v) => v.length)) return this.cantPlay(this.runner.targets);
    this.stopPlayback();
    this.playback = { path, index: null };
    this.renderSheet();
    const steps = path.map((notes, i) => ({ notes, chord: this.chords[i] }));
    this.cancelPlayback = playSequence(this.app, steps, (i) => {
      if (!this.playback) return;
      this.playback.index = i;
      if (i === null) this.stopPlayback();
      else this.highlightSheet();
    });
  }

  /** Ends "Hear progression": the sheet goes back to your own chords. */
  private stopPlayback(): void {
    this.cancelPlayback();
    if (!this.playback) return;
    this.playback = null;
    this.renderSheet();
  }

  // --- Rendering ---

  /** Show-me hints and suggestions for the current chord, and held notes marked right or wrong. */
  private paint(): void {
    const held = this.app.input.held;
    if (!held.length) this.heldVerdict = null;
    const current = this.runner?.current;
    const hints = [...new Set([...this.revealed, ...this.suggested])];
    // While a hint is up, judge held notes against the chord it is for, not the one just played.
    const judged = hints.length && current;
    paintKeys(
      this.app.keyboard,
      getKey(this.settings),
      {
        notes: held,
        verdict: judged ? checkTarget(held, current, getConstraint(this.settings)).verdict : this.heldVerdict,
        chord: judged ? current.chord : this.heldChord,
      },
      { notes: hints, chord: current?.chord ?? null },
    );
  }

  private setFeedback(kind: '' | 'ok' | 'bad', text: string): void {
    clearTimeout(this.badTimer);
    this.feedbackEl.className = `feedback ${kind}`;
    this.feedbackEl.textContent = text;
  }

  /** Clears an error once the held notes no longer make a wrong chord. */
  private clearError(): void {
    clearTimeout(this.badTimer);
    if (this.feedbackEl.classList.contains('bad')) this.setFeedback('', '');
  }

  /** Warns about any chord still to come that the current limits make impossible. */
  private updateWarning(): void {
    const s = this.settings;
    const error = getProgression(s).error;
    const remaining = this.runner ? this.runner.targets.slice(this.runner.index) : [];
    this.problem = playabilityProblem(remaining, playableRange(s), s.allowed, getKey(s));
    const fix =
      s.allowedPreset !== 'all' && !s.circleMovesAllowed
        ? 'Tick “Move the allowed notes with the key”, change the limits in the sidebar, or skip it.'
        : 'Change the allowed notes or the key window in the sidebar, or skip it.';
    this.warningEl.textContent = error ?? (this.problem ? `${this.problem}, so it can’t be played here. ${fix}` : '');
  }

  /** A chord as played ("G7/F"), or as asked for when the first chord's inversion is fixed. */
  private chipSymbol(i: number): string {
    const runner = this.runner;
    const chord = this.chords[i];
    const played = runner?.results[i]?.notes;
    if (played?.length) return playedSymbol(played, chord);
    const target = runner?.targets[i];
    if (target && target.bass.length === 1) {
      const bassPc = (pcOf(chord.root) + target.tones[target.bass[0]].semitones) % 12;
      return playedSymbol([bassPc + 60], chord);
    }
    return chordSymbol(chord);
  }

  private highlightSheet(): void {
    const runner = this.runner;
    const current = runner && !runner.finished && !this.playback ? runner.index : null;
    this.sheet?.highlight(current, this.playback?.index ?? null);
  }

  /** The progression in this key: what you played, then suggested voicings for the rest (or what "Hear" plays). */
  private renderSheet(continuation = this.continuation()): void {
    const s = this.settings;
    this.sheetCard.style.display = s.showStaff ? '' : 'none';
    if (!s.showStaff || !this.runner) return;
    const key = getKey(s);
    const voicings = this.playback?.path ?? displayVoicings(this.runner, continuation);
    const bars = this.chords.map((c, i) => sheetChord(voicings[i] ?? [], c, key, chordSymbol(c)));
    this.sheet = sheetMusic(bars, s.keySig);
    render(this.sheetCard, this.sheet.el);
    this.highlightSheet();
  }

  private renderAll(): void {
    const s = this.settings;
    const key = getKey(s);
    this.updateWarning();
    const index = this.runner?.index ?? 0;
    const lapDone = this.results.length >= LAP;
    const continuation = this.continuation();
    this.suggested = s.lightNext ? (continuation[0] ?? []) : [];
    this.paint();
    this.renderSheet(continuation);

    this.view.update({
      key,
      path: this.chords.map((chord, i) => ({
        chord,
        label: chordSymbol(chord),
        state: i < index ? 'done' : i === index ? 'current' : 'todo',
      })),
      done: this.doneKeys,
    });

    this.titleEl.textContent = keyName(key);
    const options = this.baseTargets.length ? startOptions(this.baseTargets[0]) : [];
    this.start.sync(options);
    const startLabel = s.startFrom >= 0 && options.length ? ` · start: ${options[s.startFrom % options.length].label.toLowerCase()}` : '';
    this.statusEl.textContent = lapDone
      ? `Lap complete`
      : `Key ${this.results.length + 1} of ${LAP}${startLabel} · next: ${keyName(keyFromSignature(this.nextSignature(s), s.keyMode))}`;

    render(
      this.chordsEl,
      this.chords.map((chord, i) => {
        const r = this.runner?.results[i];
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return [
          i > 0 ? h('span', { class: 'arrow' }, '→') : null,
          h(
            'div',
            { class: `step-chip ${state}` },
            h('b', {}, this.chipSymbol(i)),
            h('small', {}, romanNumeral(pcOf(chord.root), chord.quality, key)),
            r?.moved != null ? h('small', { class: 'moved' }, `moved ${r.moved}`) : null,
          ),
        ];
      }),
    );

    if (!this.results.length) {
      render(this.resultsEl, h('p', { class: 'muted' }, 'Finish the progression to move on to the next key.'));
      return;
    }
    const total = this.results.reduce(
      (t, r) => ({ ms: t.ms + r.ms, moved: t.moved + r.moved, smoothest: t.smoothest + r.smoothest }),
      { ms: 0, moved: 0, smoothest: 0 },
    );
    render(
      this.resultsEl,
      h(
        'table',
        { class: 'results-table' },
        h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'Time'), h('th', {}, 'Moved'), h('th', {}, 'Smoothest')),
        this.results.map((r) =>
          h(
            'tr',
            {},
            h('td', {}, r.key),
            h('td', {}, seconds(r.ms)),
            h('td', { class: r.moved > r.smoothest ? 'over' : 'best' }, r.moved),
            h('td', {}, r.smoothest),
          ),
        ),
        h(
          'tr',
          { class: 'total' },
          h('td', {}, 'Total'),
          h('td', {}, clock(total.ms)),
          h('td', {}, total.moved),
          h('td', {}, total.smoothest),
        ),
      ),
    );
  }
}
