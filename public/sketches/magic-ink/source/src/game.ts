// Speed Draw — a timed challenge mode (DOM + timer shell).
//
// A realistic sentence is shown; the player draws each letter with the shorthand
// alphabet before the clock runs out. Correct letters advance a cursor through
// the sentence; wrong letters are marked and cost a time penalty (the miss
// penalty in a speed-typing game). Live WPM, accuracy, and the countdown are
// shown throughout; finishing a sentence loads the next one.
//
// All scoring/cursor state lives in the pure, unit-tested core (game-core.ts);
// this module owns only rendering, the countdown, and the start/results screens.

import { createScorer, normalize, type Scorer } from './game-core';

const TIME_LIMIT_SECONDS = 60;
// Each incorrect letter burns this much off the clock — the speed-game penalty.
const PENALTY_SECONDS = 1;
// Standard typing-test convention: one "word" is five characters.
const CHARS_PER_WORD = 5;

// Realistic sentences, including a few pangrams so every letter gets practiced.
const SENTENCES = [
  'The quick brown fox jumps over the lazy dog',
  'Pack my box with five dozen liquor jugs',
  'A journey of a thousand miles begins with a single step',
  'Practice makes perfect so keep drawing every day',
  'She sells sea shells by the sea shore',
  'Never put off until tomorrow what you can do today',
  'The early bird catches the worm at dawn',
  'All that glitters is not gold my friend',
  'How vexingly quick daft zebras jump',
  'The five boxing wizards jump quickly',
  'Actions speak louder than words every time',
  'Better late than never but never late is better',
];

export type GameOptions = {
  // .ink-app root — a class is toggled on it while a game is running.
  app: HTMLElement;
  // The game HUD is inserted immediately after this element.
  hudAnchor: HTMLElement;
  // The canvas stage — start/results overlays are layered over it.
  stage: HTMLElement;
  // Wipe the ink so each stroke starts on a fresh surface.
  onClearCanvas: () => void;
  // Notified whenever the game starts (true) or ends/exits (false).
  onActiveChange?: (active: boolean) => void;
};

export type GameHandle = {
  active: () => boolean;
  // Feed a recognized letter from a committed character.
  input: (letter: string) => void;
  // A delete gesture (or the backspace button) while playing.
  backspace: () => void;
  // Open the start screen (arm the game without starting the clock).
  open: () => void;
  // The letter the player currently needs to draw, or null when not mid-play.
  // Used to glow the matching radial look-ahead hint.
  targetLetter: () => string | null;
};

// Fisher–Yates shuffle so each game draws sentences in a fresh order.
const shuffled = <T,>(items: T[]): T[] => {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const newScorer = (): Scorer => createScorer(shuffled(SENTENCES).map(normalize));

export const createGame = (options: GameOptions): GameHandle => {
  const { app, hudAnchor, stage, onClearCanvas, onActiveChange } = options;

  // --- DOM: HUD (stats + sentence) ---------------------------------------
  const hud = document.createElement('section');
  hud.className = 'game-hud';
  hud.hidden = true;
  hud.setAttribute('aria-label', 'Speed Draw status');
  hud.innerHTML = `
    <div class="game-stats">
      <div class="game-stat game-stat--time">
        <span class="game-stat-label">Time</span>
        <span class="game-stat-value" data-stat="time">60</span>
      </div>
      <div class="game-stat">
        <span class="game-stat-label">WPM</span>
        <span class="game-stat-value" data-stat="wpm">0</span>
      </div>
      <div class="game-stat">
        <span class="game-stat-label">Accuracy</span>
        <span class="game-stat-value" data-stat="acc">100%</span>
      </div>
      <div class="game-stat">
        <span class="game-stat-label">Done</span>
        <span class="game-stat-value" data-stat="done">0</span>
      </div>
      <button class="game-quit" type="button">Quit</button>
    </div>
    <div class="game-sentence" data-el="sentence" aria-live="polite"></div>
  `;
  hudAnchor.insertAdjacentElement('afterend', hud);

  const timeEl = hud.querySelector<HTMLElement>('[data-stat="time"]')!;
  const wpmEl = hud.querySelector<HTMLElement>('[data-stat="wpm"]')!;
  const accEl = hud.querySelector<HTMLElement>('[data-stat="acc"]')!;
  const doneEl = hud.querySelector<HTMLElement>('[data-stat="done"]')!;
  const sentenceEl = hud.querySelector<HTMLElement>('[data-el="sentence"]')!;
  const quitButton = hud.querySelector<HTMLButtonElement>('.game-quit')!;

  // --- DOM: overlay (start screen + results) -----------------------------
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.hidden = true;
  stage.appendChild(overlay);

  // --- State -------------------------------------------------------------
  let scorer = newScorer();
  let running = false;
  let deadline = 0; // ms timestamp when time runs out
  let startedAt = 0;
  let ticker: number | null = null;

  const accuracy = (): number => {
    const total = scorer.correctLetters() + scorer.wrongLetters();
    return total === 0 ? 1 : scorer.correctLetters() / total;
  };

  const wpm = (): number => {
    const elapsedMinutes = Math.max((Date.now() - startedAt) / 60000, 1 / 6000);
    return scorer.correctLetters() / CHARS_PER_WORD / elapsedMinutes;
  };

  const renderSentence = () => {
    const target = scorer.target();
    const statuses = scorer.statuses();
    const cursor = scorer.cursor();
    sentenceEl.replaceChildren();
    for (let i = 0; i < target.length; i += 1) {
      const ch = target[i];
      const span = document.createElement('span');
      if (ch === ' ') {
        span.className = 'game-char game-char--space';
        span.innerHTML = '&nbsp;';
      } else {
        span.className = `game-char game-char--${statuses[i]}`;
        if (i === cursor) span.classList.add('is-current');
        span.textContent = ch;
      }
      sentenceEl.appendChild(span);
    }
  };

  const renderStats = () => {
    const remaining = Math.max(0, (deadline - Date.now()) / 1000);
    timeEl.textContent = String(Math.ceil(remaining));
    timeEl.classList.toggle('is-low', running && remaining <= 10);
    wpmEl.textContent = String(Math.round(wpm()));
    accEl.textContent = `${Math.round(accuracy() * 100)}%`;
    doneEl.textContent = String(scorer.sentencesDone());
  };

  const flashPenalty = () => {
    timeEl.classList.remove('game-penalty');
    // Force a reflow so re-adding the class restarts the animation.
    void timeEl.offsetWidth;
    timeEl.classList.add('game-penalty');
  };

  const tick = () => {
    if (!running) return;
    if (Date.now() >= deadline) {
      finish();
      return;
    }
    renderStats();
  };

  const applyInput = (letter: string) => {
    if (!running) return;
    const result = scorer.input(letter);
    if (!result.correct) {
      // Speed-game penalty: dock the clock and flash the timer.
      deadline -= PENALTY_SECONDS * 1000;
      flashPenalty();
    }
    renderSentence();
    renderStats();
    if (Date.now() >= deadline) finish();
  };

  const applyBackspace = () => {
    if (!running) return;
    scorer.backspace();
    renderSentence();
    renderStats();
  };

  const showOverlay = (html: string) => {
    overlay.innerHTML = html;
    overlay.hidden = false;
  };
  const hideOverlay = () => {
    overlay.hidden = true;
    overlay.replaceChildren();
  };

  const open = () => {
    // Arm the game (show instructions) without starting the clock.
    setActive(true);
    running = false;
    stopTicker();
    scorer = newScorer();
    // Seed the display so the clock reads the full limit before Start.
    startedAt = Date.now();
    deadline = startedAt + TIME_LIMIT_SECONDS * 1000;
    renderSentence();
    renderStats();
    showOverlay(`
      <div class="game-panel">
        <h2>Speed Draw</h2>
        <p>Draw each letter of the sentence before time runs out. Correct letters
        advance the cursor; a wrong letter costs <strong>${PENALTY_SECONDS}s</strong>.
        Spaces are free. You have <strong>${TIME_LIMIT_SECONDS} seconds</strong>.</p>
        <button class="game-primary" type="button" data-action="begin">Start</button>
      </div>
    `);
    overlay
      .querySelector<HTMLButtonElement>('[data-action="begin"]')
      ?.addEventListener('click', begin);
  };

  const begin = () => {
    hideOverlay();
    onClearCanvas();
    scorer = newScorer();
    startedAt = Date.now();
    deadline = startedAt + TIME_LIMIT_SECONDS * 1000;
    running = true;
    renderSentence();
    renderStats();
    startTicker();
  };

  const finish = () => {
    running = false;
    stopTicker();
    timeEl.textContent = '0';
    const acc = Math.round(accuracy() * 100);
    const finalWpm = Math.round(wpm());
    showOverlay(`
      <div class="game-panel">
        <h2>Time!</h2>
        <div class="game-results">
          <div class="game-result"><span>${finalWpm}</span><label>WPM</label></div>
          <div class="game-result"><span>${scorer.sentencesDone()}</span><label>Sentences</label></div>
          <div class="game-result"><span>${scorer.correctLetters()}</span><label>Correct</label></div>
          <div class="game-result"><span>${scorer.wrongLetters()}</span><label>Errors</label></div>
          <div class="game-result"><span>${acc}%</span><label>Accuracy</label></div>
        </div>
        <div class="game-panel-actions">
          <button class="game-primary" type="button" data-action="again">Play again</button>
          <button type="button" data-action="exit">Done</button>
        </div>
      </div>
    `);
    overlay.querySelector<HTMLButtonElement>('[data-action="again"]')?.addEventListener('click', begin);
    overlay.querySelector<HTMLButtonElement>('[data-action="exit"]')?.addEventListener('click', exit);
  };

  const exit = () => {
    running = false;
    stopTicker();
    hideOverlay();
    setActive(false);
  };

  const startTicker = () => {
    stopTicker();
    ticker = window.setInterval(tick, 100);
  };
  const stopTicker = () => {
    if (ticker !== null) {
      window.clearInterval(ticker);
      ticker = null;
    }
  };

  const setActive = (on: boolean) => {
    hud.hidden = !on;
    app.classList.toggle('is-gaming', on);
    onActiveChange?.(on);
  };

  quitButton.addEventListener('click', exit);

  return {
    active: () => !hud.hidden,
    input: applyInput,
    backspace: applyBackspace,
    open,
    targetLetter: () => {
      if (!running) return null;
      const ch = scorer.target()[scorer.cursor()];
      return ch && ch !== ' ' ? ch : null;
    },
  };
};
