// Magic Ink shorthand alphabet.
//
// Every letter is a single stroke built from unit segments, each pointing along
// one of 8 compass directions. A direction maps directly onto the hue wheel
// (the same rule the freehand tool uses), so a letter is encoded by BOTH its
// shape and the colors that appear where it changes direction.
//
// Letters are assigned by English-letter frequency: the most common letters use
// the fewest segments, so an average word is far cheaper to draw than its
// handwritten equivalent.

export type Vec = { x: number; y: number };

// 8 directions, index 0..7 => angle index * 45deg (screen coords, +y is down).
export const DIR_COUNT = 8;

export const dirAngle = (dir: number): number => (dir * 45 * Math.PI) / 180;

// Hue for a direction — matches colorForDirection() in the drawing code.
export const dirHue = (dir: number): number => (dir * 45) % 360;

export const dirColor = (dir: number): string => `hsl(${dirHue(dir)}, 85%, 50%)`;

export const dirVector = (dir: number): Vec => ({
  x: Math.cos(dirAngle(dir)),
  y: Math.sin(dirAngle(dir)),
});

// Direction indices: 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
// East (0) is reserved for the "submit current character, start a new one"
// gesture (a rightward motion), so no letter uses it.
export const EAST = 0;
const SE = 1;
const S = 2;
const SW = 3;
const W = 4;
const NW = 5;
const N = 6;
const NE = 7;

// letter -> ordered direction indices (the "word"). No word is a single EAST or
// single WEST move — those are reserved (east = advance, west = ignored). West
// may still appear as a segment inside a 2-stroke letter. All words unique.
export const ALPHABET: Record<string, number[]> = {
  // 1 segment — 6 single-direction letters (the two horizontal directions, east
  // and west, are reserved, leaving 6 usable directions). These 6 are the 6 most
  // frequent English letters, and their directions are biased rightward by
  // frequency: the usable directions split into three horizontal bands —
  // rightward (NE, SE), neutral (N, S), leftward (NW, SW) — and the most frequent
  // letters take the most rightward band, with the up-diagonal going to the more
  // frequent letter within each band.
  E: [NE],
  T: [SE],
  A: [N],
  O: [S],
  I: [NW],
  N: [SW],
  // 2 segments — one turn, so a second color appears.
  S: [SW, N],
  R: [NW, SW],
  H: [S, W],
  D: [W, S],
  L: [SW, SE],
  C: [N, W],
  U: [W, N],
  M: [NE, NW],
  W: [NW, NE],
  F: [SE, SW],
  G: [SW, NW],
  Y: [SE, NE],
  P: [NE, SE],
  B: [S, NW],
  V: [N, SE],
  K: [W, NE],
  // 2 segments via a retrace: draw out, then straight back over the same line.
  // The ink overlaps, but the direction flip recolors the return.
  Z: [S, N],
  J: [N, S],
  X: [SE, NW],
  Q: [SW, NE],
};

// Build the polyline for a word: start at origin, walk one unit per segment.
export const wordPolyline = (word: number[], length = 1): Vec[] => {
  const points: Vec[] = [{ x: 0, y: 0 }];
  let cursor: Vec = { x: 0, y: 0 };

  for (const dir of word) {
    const step = dirVector(dir);
    cursor = { x: cursor.x + step.x * length, y: cursor.y + step.y * length };
    points.push(cursor);
  }

  return points;
};

// Color of segment `index` (segment ending at points[index]). Every segment is
// colored by its own direction — including the first — so a stroke reads
// differently from one heading the opposite way. Only the start dot (index 0),
// drawn before any direction exists, uses the base color.
export const segmentColor = (word: number[], index: number, baseColor: string): string =>
  index === 0 ? baseColor : dirColor(word[index - 1]);

const isPrefix = (prefix: number[], word: number[]): boolean =>
  prefix.length <= word.length && prefix.every((value, i) => value === word[i]);

export type ReachableLetter = {
  letter: string;
  // The extra direction segments needed beyond what's drawn so far. An empty
  // `ext` means the letter is complete right now (just lift). `ext.length` is
  // therefore how many more strokes away the letter is.
  ext: number[];
  complete: boolean;
};

// Every letter still reachable from the partial word drawn so far, with the
// remaining moves needed. Used to lay out the radial look-ahead hints.
export const reachableLetters = (partialWord: number[]): ReachableLetter[] => {
  const result: ReachableLetter[] = [];

  for (const [letter, word] of Object.entries(ALPHABET)) {
    if (!isPrefix(partialWord, word)) {
      continue;
    }
    result.push({
      letter,
      ext: word.slice(partialWord.length),
      complete: word.length === partialWord.length,
    });
  }

  return result;
};

const pathLength = (points: Vec[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
};

// Resample a polyline into `count` points spaced evenly along its arc length.
const resample = (points: Vec[], count: number): Vec[] => {
  const total = pathLength(points);
  if (total === 0) {
    return [points[0]];
  }

  const interval = total / (count - 1);
  const output: Vec[] = [points[0]];
  let prev = points[0];
  let accumulated = 0;

  for (let i = 1; i < points.length; ) {
    const curr = points[i];
    const segment = Math.hypot(curr.x - prev.x, curr.y - prev.y);

    if (accumulated + segment >= interval && output.length < count - 1) {
      const t = (interval - accumulated) / segment;
      const next = { x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y) };
      output.push(next);
      prev = next;
      accumulated = 0;
    } else {
      accumulated += segment;
      prev = curr;
      i += 1;
    }
  }

  while (output.length < count) {
    output.push(points[points.length - 1]);
  }

  return output;
};

const SAMPLES = 64;
const SMOOTH_WINDOW = 5;
// Heading is measured across this many resampled points, not adjacent ones, so
// per-point jitter averages out and only genuine direction changes survive.
const HEADING_GAP = 6;
const MIN_RUN_FRACTION = 0.17;
// A new segment only begins when the heading swings past this far from the
// segment's running-average direction. Every corner in the alphabet is at least
// 90 degrees, so a threshold below that splits real turns while absorbing the
// gentler wobble of an off-angle stroke start into the segment's average.
const TURN_SPLIT_COS = Math.cos((3 * Math.PI) / 8); // 67.5 degrees

// Moving-average smoothing to damp hand jitter before direction extraction.
const smooth = (points: Vec[], window: number): Vec[] => {
  if (points.length <= 2) {
    return points;
  }
  const half = Math.floor(window / 2);
  const out: Vec[] = [];
  for (let i = 0; i < points.length; i += 1) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(points.length - 1, i + half); j += 1) {
      sx += points[j].x;
      sy += points[j].y;
      count += 1;
    }
    out.push({ x: sx / count, y: sy / count });
  }
  return out;
};

const quantizeVector = (x: number, y: number): number => {
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return Math.round(degrees / 45) % DIR_COUNT;
};

// A run of consecutive headings that belong to one straight segment. The
// direction is taken from the segment's AVERAGE heading (the summed unit
// vectors), not from any single sample — so a shaky or off-angle start is pulled
// back toward where the segment actually goes overall.
type Segment = { sumX: number; sumY: number; count: number };

const segmentDirection = (segment: Segment): number =>
  quantizeVector(segment.sumX, segment.sumY);

// Reduce a drawn path to its sequence of dominant directions.
export const strokeToWord = (points: Vec[]): number[] => {
  if (points.length < 2 || pathLength(points) < 1) {
    return [];
  }

  const sampled = smooth(resample(points, SAMPLES), SMOOTH_WINDOW);

  // Group per-sample headings into segments. A heading joins the current segment
  // unless it swings past TURN_SPLIT_COS from that segment's running-average
  // direction, in which case it opens a new segment (a real corner). Averaging
  // within a segment is what lets a slightly-off character self-correct.
  const segments: Segment[] = [];
  let headingCount = 0;

  for (let i = 0; i + HEADING_GAP < sampled.length; i += 1) {
    const dx = sampled[i + HEADING_GAP].x - sampled[i].x;
    const dy = sampled[i + HEADING_GAP].y - sampled[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      continue;
    }
    headingCount += 1;
    const ux = dx / len;
    const uy = dy / len;

    const current = segments[segments.length - 1];
    if (current) {
      const meanLen = Math.hypot(current.sumX, current.sumY) || 1;
      const alignment = (current.sumX * ux + current.sumY * uy) / meanLen;
      if (alignment >= TURN_SPLIT_COS) {
        current.sumX += ux;
        current.sumY += uy;
        current.count += 1;
        continue;
      }
    }
    segments.push({ sumX: ux, sumY: uy, count: 1 });
  }

  // Drop tiny segments (corner rounding, end hooks), then quantize each
  // segment's average heading and collapse consecutive duplicates.
  const minRun = Math.max(3, Math.floor(headingCount * MIN_RUN_FRACTION));
  const word: number[] = [];
  for (const segment of segments) {
    if (segment.count < minRun) {
      continue;
    }
    const dir = segmentDirection(segment);
    if (word.length === 0 || word[word.length - 1] !== dir) {
      word.push(dir);
    }
  }

  // Fallback: a stroke too short/noisy to survive filtering keeps its longest
  // segment's average direction.
  if (word.length === 0 && segments.length > 0) {
    const longest = segments.reduce((a, b) => (b.count > a.count ? b : a));
    word.push(segmentDirection(longest));
  }

  return word;
};

// Circular distance between two direction indices (0..4).
const dirDistance = (a: number, b: number): number => {
  const diff = Math.abs(a - b) % DIR_COUNT;
  return Math.min(diff, DIR_COUNT - diff);
};

// Levenshtein distance with an angular substitution cost, so a near-miss on a
// single segment costs less than a wrong number of segments.
const wordDistance = (a: number[], b: number[]): number => {
  const rows = a.length;
  const cols = b.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));

  for (let i = 0; i <= rows; i += 1) dp[i][0] = i;
  for (let j = 0; j <= cols; j += 1) dp[0][j] = j;

  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      const substitution = dirDistance(a[i - 1], b[j - 1]) / 4;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + substitution,
      );
    }
  }

  return dp[rows][cols];
};

// A scratch-out (back-and-forth) means "delete the previous character". Since
// rightward motion is now the "advance" command, the delete gesture is a
// VERTICAL scratch-out (S-N-S-N); any zigzag with 3+ reversals is accepted.
export const BACKSPACE_WORD = [2, 6, 2, 6];

// Word-based scratch detection (for the live, incremental direction word).
const wordIsScratch = (word: number[]): boolean => {
  if (word.length < 4) {
    return false;
  }
  let reversals = 0;
  for (let i = 1; i < word.length; i += 1) {
    if (dirDistance(word[i - 1], word[i]) >= 3) {
      reversals += 1;
    }
  }
  return reversals >= 3;
};

export type WordRecognition =
  | { kind: 'letter'; letter: string; distance: number }
  | { kind: 'command'; command: 'backspace' }
  | null;

// Classify a direction word (built incrementally while drawing) as the nearest
// letter or a command.
export const recognizeWord = (word: number[]): WordRecognition => {
  if (word.length === 0) {
    return null;
  }
  // A lone leftward stroke is intentionally ignored — it does nothing, so it
  // can't be confused with the rightward "advance" command.
  if (word.length === 1 && word[0] === W) {
    return null;
  }
  if (wordIsScratch(word)) {
    return { kind: 'command', command: 'backspace' };
  }

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const [letter, canonical] of Object.entries(ALPHABET)) {
    const distance = wordDistance(word, canonical);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = letter;
    }
  }
  return best === null ? null : { kind: 'letter', letter: best, distance: bestDistance };
};

// Count how many times motion reverses along one axis, with a deadband so hand
// jitter doesn't register as a reversal.
const axisReversals = (values: number[], deadband: number): number => {
  let direction = 0;
  let reversals = 0;
  let reference = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - reference;
    if (Math.abs(delta) < deadband) {
      continue;
    }
    const next = delta > 0 ? 1 : -1;
    if (direction !== 0 && next !== direction) {
      reversals += 1;
    }
    direction = next;
    reference = values[i];
  }
  return reversals;
};

// Geometric scratch-out test: independent of scale and the letter pipeline. A
// letter has at most 2 turns, so it can reverse along an axis at most twice.
const isScratchOut = (points: Vec[]): boolean => {
  if (points.length < 4) {
    return false;
  }
  const sampled = smooth(resample(points, SAMPLES), SMOOTH_WINDOW);
  const xs = sampled.map((p) => p.x);
  const ys = sampled.map((p) => p.y);
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const deadband = span * 0.2;
  return Math.max(axisReversals(xs, deadband), axisReversals(ys, deadband)) >= 3;
};

export type Recognition =
  | { kind: 'letter'; letter: string; distance: number; word: number[] }
  | { kind: 'command'; command: 'backspace'; word: number[] };

// Classify a drawn stroke as a command or the nearest alphabet letter.
export const recognize = (points: Vec[]): Recognition | null => {
  const word = strokeToWord(points);
  if (word.length === 0) {
    return null;
  }

  if (isScratchOut(points)) {
    return { kind: 'command', command: 'backspace', word };
  }

  let best: string | null = null;
  let bestDistance = Infinity;

  for (const [letter, canonical] of Object.entries(ALPHABET)) {
    const distance = wordDistance(word, canonical);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = letter;
    }
  }

  return best === null ? null : { kind: 'letter', letter: best, distance: bestDistance, word };
};
