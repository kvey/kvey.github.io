// Pure scoring state machine for Speed Draw — no DOM, no timers, so it can be
// unit-tested directly. The DOM/timer shell in game.ts drives this and reflects
// its state into the HUD.
//
// A "target" is a normalized sentence (A–Z and single spaces). The cursor always
// rests on a letter (or one past the end); spaces are skipped automatically, so
// the player only ever has to draw letters.

export type CharStatus = 'pending' | 'correct' | 'wrong';

export type InputResult = {
  // Whether the drawn letter matched the expected one.
  correct: boolean;
  // True when that input completed the sentence (a new one has been loaded).
  sentenceComplete: boolean;
};

export const normalize = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// First letter index at or after `from` (skips spaces). Returns target.length
// when only spaces / nothing remain.
export const nextLetterIndex = (target: string, from: number): number => {
  let i = Math.max(0, from);
  while (i < target.length && target[i] === ' ') i += 1;
  return i;
};

// Nearest letter index at or before `from` (skips spaces). Returns -1 if none.
export const prevLetterIndex = (target: string, from: number): number => {
  let i = Math.min(from, target.length - 1);
  while (i >= 0 && target[i] === ' ') i -= 1;
  return i;
};

export type Scorer = {
  // The current sentence, its per-character statuses, and the cursor position.
  target: () => string;
  statuses: () => readonly CharStatus[];
  cursor: () => number;
  correctLetters: () => number;
  wrongLetters: () => number;
  sentencesDone: () => number;
  // Reset all counters and load the first sentence.
  reset: () => void;
  // Score a drawn letter against the expected one and advance.
  input: (letter: string) => InputResult;
  // Undo the previous letter (delete gesture / backspace button).
  backspace: () => void;
};

// `sentences` should already be normalized. The scorer cycles through them in
// order, reloading from the top once exhausted, so callers control ordering
// (e.g. shuffle before passing them in).
export const createScorer = (sentences: string[]): Scorer => {
  const pool = sentences.length > 0 ? sentences : [''];
  let poolIndex = 0;

  let target = '';
  let statuses: CharStatus[] = [];
  let cursor = 0;
  let correct = 0;
  let wrong = 0;
  let done = 0;

  const load = () => {
    target = pool[poolIndex % pool.length];
    poolIndex += 1;
    statuses = Array.from(target, () => 'pending' as CharStatus);
    cursor = nextLetterIndex(target, 0);
  };

  const reset = () => {
    poolIndex = 0;
    correct = 0;
    wrong = 0;
    done = 0;
    load();
  };

  const onLetter = (i: number): boolean => i >= 0 && i < target.length && target[i] !== ' ';

  const input = (letter: string): InputResult => {
    if (!onLetter(cursor)) {
      return { correct: false, sentenceComplete: false };
    }
    const isCorrect = letter === target[cursor];
    if (isCorrect) {
      statuses[cursor] = 'correct';
      correct += 1;
    } else {
      statuses[cursor] = 'wrong';
      wrong += 1;
    }

    cursor = nextLetterIndex(target, cursor + 1);
    if (cursor >= target.length) {
      done += 1;
      load();
      return { correct: isCorrect, sentenceComplete: true };
    }
    return { correct: isCorrect, sentenceComplete: false };
  };

  const backspace = () => {
    const prev = prevLetterIndex(target, cursor - 1);
    if (prev < 0) return;
    if (statuses[prev] === 'correct') correct = Math.max(0, correct - 1);
    else if (statuses[prev] === 'wrong') wrong = Math.max(0, wrong - 1);
    statuses[prev] = 'pending';
    cursor = prev;
  };

  reset();

  return {
    target: () => target,
    statuses: () => statuses,
    cursor: () => cursor,
    correctLetters: () => correct,
    wrongLetters: () => wrong,
    sentencesDone: () => done,
    reset,
    input,
    backspace,
  };
};
