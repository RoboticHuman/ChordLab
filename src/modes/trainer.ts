import { isTyping } from '../input/computerKeys';
import { type Settings, type TrainerSettings, getConstraint, getKey, keyChange, randomSignature } from '../state';
import {
  type Chord,
  type ChordGroup,
  INVERSION_NAMES,
  QUALITIES,
  bestRootSpelling,
  chordSymbol,
  chordTones,
} from '../theory/chords';
import { keyName, romanNumeral, scaleNotes, scalePcSet } from '../theory/keys';
import { mod12, noteName, pcOf, pcSet, pcSetHas, pcSetIsSubset } from '../theory/notes';
import { type Target, checkTarget, fullTarget, requiredPcs } from '../theory/target';
import { voiceLeading, voicings } from '../theory/voicing';
import { h, render } from '../ui/dom';
import { sheetMusic } from '../ui/sheet';
import {
  type AppContext,
  type Mode,
  demoRange,
  describeCheck,
  paintKeys,
  playAndShow,
  playableRange,
  sheetChord,
  suggestVoicing,
} from './mode';

interface Item {
  /** Stable id for stats: root pitch class, quality, inversion. */
  id: string;
  chord: Chord;
  /** Inversion to play, or null when any voicing counts. */
  inversion: number | null;
  target: Target;
}

interface ItemStats {
  attempts: number;
  misses: number;
  /** Total time of the attempts that were not misses. */
  totalMs: number;
}

const STATS_KEY = 'chords.trainerStats';

const GROUPS: { group: ChordGroup; title: string }[] = [
  { group: 'triad', title: 'Triads' },
  { group: 'seventh', title: 'Sevenths' },
  { group: 'sixth', title: 'Sixths' },
  { group: 'ninth', title: 'Ninths' },
];

/** Every chord the current settings can ask for that is actually playable under the constraints. */
function buildPool(s: Settings): Item[] {
  const t = s.trainer;
  const key = getKey(s);
  const scale = scalePcSet(key);
  const allowed = getConstraint(s).allowed;
  const range = playableRange(s);
  const items: Item[] = [];
  for (const quality of QUALITIES) {
    if (!t.qualities.includes(quality.id)) continue;
    for (let pc = 0; pc < 12; pc++) {
      const pcs = quality.tones.map((tone) => mod12(pc + tone.semitones));
      if (t.roots === 'key' && !pcSetIsSubset(pcSet(pcs), scale)) continue;
      // Roots in the key are spelled as the key spells them; others as the chord reads most simply (C♯m, D♭).
      const diatonic = scaleNotes(key).find((n) => pcOf(n) === pc);
      const chord = { root: diatonic ?? bestRootSpelling(pc, quality), quality };
      const inversions =
        t.inversions === 'any'
          ? [null]
          : t.inversions === 'root'
            ? [0]
            : quality.tones.flatMap((tone, i) => (tone.degree <= 7 ? [i] : [])); // no 9th in the bass
      for (const inversion of inversions) {
        const target = fullTarget(chord, inversion, t.allowNo5);
        const need = requiredPcs(target);
        if (!pcSetIsSubset(pcSet(need), allowed)) continue;
        const bassPc = inversion === null ? undefined : pcs[inversion];
        if (!voicings(need, range.low, range.high, { bassPc }).length) continue;
        items.push({ id: `${pc}:${quality.id}:${inversion ?? '*'}`, chord, inversion, target });
      }
    }
  }
  return items;
}

function loadStats(): Record<string, ItemStats> {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Shows a chord name; you play it. Chords you miss or play slowly come up more often. */
export class TrainerMode implements Mode {
  private cleanup: (() => void)[] = [];
  private pool: Item[] = [];
  private item: Item | null = null;
  private shownAt = 0;
  private solved = false;
  /** Played enough notes for a full chord at least once without getting it right. */
  private attempted = false;
  /** This chord already counted as a miss. */
  private missed = false;
  /** Notes highlighted by "Show me". */
  private revealed: number[] = [];
  private lastAnswer: number[] = [];
  private releaseTimer = 0;
  /** Set while next() changes the Key, so the settings change isn't treated as the user's. */
  private changingKey = false;
  private badTimer = 0;
  private session = { correct: 0, misses: 0, streak: 0, best: 0, totalMs: 0 };
  private stats = loadStats();

  private symbolEl = h('div', { class: 'chord-symbol' });
  private descEl = h('div', { class: 'chord-desc' });
  private numeralEl = h('div', { class: 'chord-numeral' });
  private feedbackEl = h('div', { class: 'feedback' });
  private statsEl = h('div', { class: 'stats' });
  private optionsEl = h('div', { class: 'options' });
  private sheetCard = h('div', { class: 'prompt-sheet' });
  /** The voicing shown on the sheet: from Show me, or your answer once it's right. */
  private shown: number[] = [];

  constructor(private app: AppContext) {}

  mount(root: HTMLElement): void {
    render(
      root,
      h(
        'div',
        { class: 'mode-grid' },
        h(
          'div',
          { class: 'col' },
      h(
        'div',
        { class: 'card chord-card prompt-card' },
        h(
          'div',
          { class: 'prompt-main' },
        h('div', { class: 'prompt-label' }, 'Play'),
        this.symbolEl,
        this.descEl,
        this.numeralEl,
        h(
          'div',
          { class: 'row buttons' },
          h('button', { onclick: () => this.hear(), title: 'Shortcut: Space' }, '▶ Hear it'),
          h('button', { onclick: () => this.reveal() }, 'Show me'),
          h('button', { onclick: () => this.skip() }, 'Skip'),
        ),
        this.feedbackEl,
        ),
        this.sheetCard,
      ),
      h('div', { class: 'card' }, this.statsEl),
        ),
        h(
          'div',
          { class: 'col' },
          h('details', { class: 'card', open: true }, h('summary', {}, 'Exercise options'), this.optionsEl),
        ),
      ),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e)) return;
      e.preventDefault();
      // Stop a focused button from also being "clicked" by the space bar.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.hear();
    };
    window.addEventListener('keydown', onKey);
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKey),
      this.app.input.changed.on((held) => this.evaluate(held)),
      this.app.settings.subscribe(() => this.onSettings()),
    );
    this.pool = buildPool(this.app.settings.value);
    this.renderOptions();
    this.next();
    this.renderStats();
  }

  unmount(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    clearTimeout(this.releaseTimer);
    clearTimeout(this.badTimer);
    this.app.keyboard.setMarks(new Map());
    this.app.keyboard.setLabels(new Map());
  }

  private get settings(): Settings {
    return this.app.settings.value;
  }

  private updateTrainer(patch: Partial<TrainerSettings>): void {
    this.app.settings.update({ trainer: { ...this.settings.trainer, ...patch } });
  }

  private onSettings(): void {
    if (this.changingKey) return; // next() is moving the key itself
    const currentId = this.item?.id;
    this.pool = buildPool(this.settings);
    this.renderOptions();
    const same = this.pool.find((i) => i.id === currentId);
    if (same && !this.solved) {
      this.item = same; // respelled for the new key, if it changed
      this.renderPrompt();
      this.evaluate(this.app.input.held);
    } else if (!same) {
      this.next(false);
    }
    this.renderStats();
  }

  // --- Flow ---

  /** Moves the Key to a random new one (and the allowed notes with it, if they follow the key). */
  private moveKey(): void {
    const s = this.settings;
    this.changingKey = true;
    this.app.settings.update(keyChange(s, randomSignature(s.keySig, s.keyMode), s.keyMode, s.allowedFollowKey));
    this.changingKey = false;
    this.pool = buildPool(this.settings);
    this.renderOptions();
  }

  /** The next chord. `moveKey`: also move to a new key, if "Change key after each chord" is on. */
  private next(moveKey = true): void {
    clearTimeout(this.releaseTimer);
    if (moveKey && this.item && this.settings.trainer.changeKey) this.moveKey();
    this.solved = false;
    this.attempted = false;
    this.missed = false;
    this.revealed = [];
    this.shown = [];
    this.item = this.pick();
    this.shownAt = performance.now();
    this.renderPrompt();
    this.setFeedback('', '');
    this.evaluate(this.app.input.held);
  }

  private weight(item: Item): number {
    const st = this.stats[item.id];
    if (!st?.attempts) return 2.5; // unseen chords come up often
    const clean = st.attempts - st.misses;
    const avgSeconds = clean ? st.totalMs / clean / 1000 : 6;
    return 1 + 4 * (st.misses / st.attempts) + Math.min(3, avgSeconds / 2);
  }

  private pick(): Item | null {
    const current = this.item?.id;
    const candidates = this.pool.length > 1 ? this.pool.filter((i) => i.id !== current) : this.pool;
    if (!candidates.length) return null;
    const weights = candidates.map((i) => this.weight(i));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  private evaluate(held: number[]): void {
    const item = this.item;
    clearTimeout(this.badTimer);
    if (!item) return;
    if (!held.length) {
      if (this.solved) return this.next();
      if (this.attempted && !this.missed) this.recordMiss();
      this.attempted = false;
      this.paint(held, null);
      return;
    }
    const key = getKey(this.settings);
    if (this.solved) {
      // A late note of the same chord (or one let go early): remember the fullest voicing for voice leading.
      if (checkTarget(held, item.target, getConstraint(this.settings)).correct) this.lastAnswer = held;
      return;
    }

    const check = checkTarget(held, item.target, getConstraint(this.settings));
    this.paint(held, check.verdict);

    if (check.correct) return this.succeed(held);
    if (check.complete) this.attempted = true;
    if (check.complete) {
      const text = describeCheck(check, item.target, held, key, getConstraint(this.settings));
      this.badTimer = window.setTimeout(() => this.setFeedback('bad', text), 250);
    } else if (this.feedbackEl.classList.contains('bad')) this.setFeedback('', '');
  }

  private succeed(held: number[]): void {
    const item = this.item!;
    const ms = performance.now() - this.shownAt;
    this.solved = true;
    const st = (this.stats[item.id] ??= { attempts: 0, misses: 0, totalMs: 0 });
    st.attempts++;
    if (this.missed) st.misses++;
    else {
      st.totalMs += ms;
      this.session.correct++;
      this.session.totalMs += ms;
      this.session.streak++;
      this.session.best = Math.max(this.session.best, this.session.streak);
    }
    this.saveStats();

    let motion = '';
    if (this.lastAnswer.length) {
      const moved = voiceLeading(this.lastAnswer, held).distance;
      const s = this.settings;
      const smoothest = suggestVoicing(item.target, this.lastAnswer, playableRange(s), s.allowed);
      const best = smoothest ? Math.min(moved, voiceLeading(this.lastAnswer, smoothest).distance) : moved;
      motion = ` · moved ${moved} semitone${moved === 1 ? '' : 's'} from the last chord`;
      motion += best < moved ? ` (smoothest possible: ${best})` : ' (smoothest possible!)';
    }
    this.lastAnswer = held;
    this.shown = held;
    this.renderSheet();
    const time = `${(ms / 1000).toFixed(1)} s`;
    this.setFeedback('ok', `✓ ${this.missed ? 'Got it' : time}${motion}. Release to continue.`);
    this.renderStats();

    // Mouse-latched notes never get "released", so let go of them for the player.
    if (held.some((n) => this.app.input.isHeldBy(n, 'mouse'))) {
      this.releaseTimer = window.setTimeout(() => this.app.input.releaseAll('mouse'), 900);
    }
  }

  private recordMiss(): void {
    this.missed = true;
    this.session.misses++;
    this.session.streak = 0;
    this.renderStats();
  }

  private skip(): void {
    if (this.item && !this.solved) {
      const st = (this.stats[this.item.id] ??= { attempts: 0, misses: 0, totalMs: 0 });
      st.attempts++;
      st.misses++;
      this.saveStats();
      if (!this.missed) this.recordMiss();
    }
    this.next();
  }

  /** A voicing to demonstrate: inside the window, moving as little as possible from your last answer. */
  private demoVoicing(): number[] | null {
    const item = this.item;
    if (!item) return null;
    const s = this.settings;
    const range = demoRange(s);
    return (
      suggestVoicing(item.target, this.lastAnswer, range, s.allowed) ??
      // Nothing fits with the 5th (tight window or the 5th not allowed): show it without.
      suggestVoicing(fullTarget(item.chord, item.inversion, true), this.lastAnswer, range, s.allowed)
    );
  }

  private hear(): void {
    const notes = this.demoVoicing();
    if (notes && this.item) playAndShow(this.app, notes, this.item.chord);
  }

  private reveal(): void {
    if (!this.item || this.solved) return;
    const notes = this.demoVoicing();
    if (!notes) return;
    this.revealed = notes;
    this.shown = notes;
    this.renderSheet();
    if (!this.missed) this.recordMiss();
    playAndShow(this.app, notes, this.item.chord);
    this.evaluate(this.app.input.held);
    if (!this.app.input.held.length) this.setFeedback('', 'Play the highlighted keys (or any other voicing of this chord).');
  }

  private paint(held: readonly number[], verdict: Map<number, boolean> | null): void {
    const chord = this.item?.chord ?? null;
    paintKeys(this.app.keyboard, getKey(this.settings), { notes: held, verdict, chord }, { notes: this.revealed, chord });
  }

  // --- Rendering ---

  private setFeedback(kind: '' | 'ok' | 'bad', text: string): void {
    clearTimeout(this.badTimer);
    this.feedbackEl.className = `feedback ${kind}`;
    this.feedbackEl.textContent = text;
  }

  /** The chord on the staff: just its symbol until you've played it (or asked to be shown). */
  private renderSheet(): void {
    const s = this.settings;
    this.sheetCard.style.display = s.showStaff ? '' : 'none';
    const item = this.item;
    if (!s.showStaff || !item) return;
    const label = chordSymbol(item.chord, item.inversion ?? 0);
    render(this.sheetCard, sheetMusic([sheetChord(this.shown, item.chord, getKey(s), label)], s.keySig).el);
  }

  private renderPrompt(): void {
    this.renderSheet();
    const item = this.item;
    if (!item) {
      this.symbolEl.textContent = '—';
      this.descEl.textContent =
        'No chords fit these settings. Pick more chord types, allow more notes, or widen the key window.';
      this.numeralEl.textContent = '';
      return;
    }
    const { chord, inversion } = item;
    this.symbolEl.textContent = chordSymbol(chord, inversion ?? 0);
    const position =
      inversion === null
        ? 'any inversion'
        : INVERSION_NAMES[inversion] + (inversion > 0 ? ` (${noteName(chordTones(chord)[inversion])} in the bass)` : '');
    this.descEl.textContent = `${noteName(chord.root)} ${chord.quality.name} · ${position}`;
    // The chord's role in the current key (whose signature is on the staff), or plainly that it isn't in it.
    const key = getKey(this.settings);
    const scale = scalePcSet(key);
    const outside = chordTones(chord).filter((n) => !pcSetHas(scale, pcOf(n))).map(noteName);
    const numeral = romanNumeral(pcOf(chord.root), chord.quality, key);
    const uses = `uses ${outside.join(', ')}`;
    this.numeralEl.classList.toggle('outside', outside.length > 0);
    this.numeralEl.textContent = !outside.length
      ? `${numeral} in ${keyName(key)}`
      : numeral.includes('/') // a secondary dominant still has a role in the key
        ? `${numeral} in ${keyName(key)} · ${uses}`
        : `Not in ${keyName(key)} · ${uses}`;
  }

  private renderStats(): void {
    const { correct, misses, streak, best, totalMs } = this.session;
    const avg = correct ? `${(totalMs / correct / 1000).toFixed(1)} s` : '–';
    const weak = this.pool
      .filter((i) => this.stats[i.id]?.attempts)
      .map((i) => ({ i, w: this.weight(i) }))
      .filter(({ w }) => w > 2)
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map(({ i }) => chordSymbol(i.chord, i.inversion ?? 0));
    const stat = (label: string, value: string | number) =>
      h('div', { class: 'stat' }, h('b', {}, String(value)), h('small', {}, label));
    render(
      this.statsEl,
      h(
        'div',
        { class: 'stat-row' },
        stat('correct', correct),
        stat('missed', misses),
        stat('streak', streak),
        stat('best streak', best),
        stat('avg time', avg),
      ),
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'muted' }, weak.length ? `Needs work: ${weak.join(' · ')}` : 'Chords you miss or play slowly will come up more often.'),
        h(
          'button',
          {
            class: 'small',
            title: 'Forget which chords you find hard',
            onclick: () => {
              this.stats = {};
              this.saveStats();
              this.renderStats();
            },
          },
          'Reset history',
        ),
      ),
    );
  }

  private renderOptions(): void {
    const t = this.settings.trainer;
    const key = getKey(this.settings);
    const radio = <V extends string>(name: string, value: V, current: V, label: string, onPick: (v: V) => void) =>
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'radio', name, checked: value === current, onchange: () => onPick(value) }),
        label,
      );
    const check = (checked: boolean, label: string, onToggle: (on: boolean) => void) =>
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked, onchange: (e: Event) => onToggle((e.target as HTMLInputElement).checked) }),
        label,
      );
    const toggleQuality = (id: string, on: boolean) =>
      this.updateTrainer({ qualities: on ? [...t.qualities, id] : t.qualities.filter((q) => q !== id) });

    render(
      this.optionsEl,
      h(
        'div',
        { class: 'option-group' },
        h('h4', {}, 'Chord types'),
        GROUPS.map(({ group, title }) =>
          h(
            'div',
            { class: 'quality-row' },
            h('span', { class: 'muted' }, title),
            QUALITIES.filter((q) => q.group === group).map((q) =>
              h(
                'label',
                { class: 'check', title: q.name },
                h('input', {
                  type: 'checkbox',
                  checked: t.qualities.includes(q.id),
                  onchange: (e: Event) => toggleQuality(q.id, (e.target as HTMLInputElement).checked),
                }),
                `C${q.symbol}`,
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'option-group' },
        h('h4', {}, 'Chords'),
        radio('roots', 'key', t.roots, `In the key (${keyName(key)})`, (roots) => this.updateTrainer({ roots })),
        radio('roots', 'all', t.roots, `Any root (also chords outside ${keyName(key)})`, (roots) => this.updateTrainer({ roots })),
        h('h4', { class: 'spaced' }, 'Key'),
        check(t.changeKey, 'Change key after each chord', (changeKey) => this.updateTrainer({ changeKey })),
        check(this.settings.allowedFollowKey, 'Allowed notes follow the key', (allowedFollowKey) =>
          this.app.settings.update({ allowedFollowKey }),
        ),
      ),
      h(
        'div',
        { class: 'option-group' },
        h('h4', {}, 'Inversions'),
        radio('inv', 'any', t.inversions, 'Any voicing', (inversions) => this.updateTrainer({ inversions })),
        radio('inv', 'root', t.inversions, 'Root position', (inversions) => this.updateTrainer({ inversions })),
        radio('inv', 'ask', t.inversions, 'Ask for a specific inversion', (inversions) =>
          this.updateTrainer({ inversions }),
        ),
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: t.allowNo5,
            onchange: (e: Event) => this.updateTrainer({ allowNo5: (e.target as HTMLInputElement).checked }),
          }),
          'Accept 7th and 9th chords without the 5th',
        ),
      ),
      h('p', { class: 'muted' }, `${this.pool.length} chords in the pool.`),
    );
  }

  private saveStats(): void {
    localStorage.setItem(STATS_KEY, JSON.stringify(this.stats));
  }
}
