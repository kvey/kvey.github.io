import './style.css';
import {
  recognizeWord,
  strokeToWord,
  reachableLetters,
  dirAngle,
  dirColor,
  DIR_COUNT,
  EAST,
  ALPHABET,
} from './alphabet';
import { buildGuide, glyphForLetter } from './guide';
import { createGame } from './game';

type Point = {
  x: number;
  y: number;
};

// A single mouse-down → mouse-up gesture, kept as an independent object so it
// can be re-rendered on its own (and, later, hit-tested, moved, or removed).
// `colors[i]` is the ink used for the segment ending at `points[i]`; `colors[0]`
// colors the starting dot. Coordinates are in CSS pixels, resolution-independent.
type Stroke = {
  size: number;
  points: Point[];
  colors: string[];
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="ink-app" aria-label="Magic Ink drawing app">
    <header class="toolbar" aria-label="Drawing tools">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>Magic Ink</span>
      </div>
      <label class="control">
        <span>Color</span>
        <input id="colorPicker" type="color" value="#111827" aria-label="Brush color" />
      </label>
      <label class="control control-wide">
        <span>Size</span>
        <input id="brushSize" type="range" min="1" max="48" value="8" aria-label="Brush size" />
        <output id="brushSizeValue" for="brushSize">8</output>
      </label>
      <button id="playGame" type="button">Speed Draw</button>
      <button id="toggleGuide" type="button">Guide</button>
      <button id="clearCanvas" type="button">Clear</button>
      <button id="downloadCanvas" type="button">Download</button>
    </header>
    <div class="readout" aria-label="Decoded text">
      <span class="readout-label">Decoded</span>
      <output id="decoded" class="decoded"></output>
      <button id="backspace" type="button" aria-label="Delete last letter">⌫</button>
    </div>
    <aside id="guidePanel" class="guide-strip" aria-label="Alphabet guide">
      <div class="translator">
        <input
          id="phraseInput"
          class="phrase-input"
          type="text"
          placeholder="Type to preview…"
          aria-label="Type text to preview in shorthand"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
        />
        <div id="phrasePreview" class="phrase-preview" aria-hidden="true"></div>
      </div>
    </aside>
    <section class="canvas-frame" aria-label="Drawing area">
      <div class="canvas-stage">
        <canvas id="drawingCanvas" aria-label="Blank drawing canvas"></canvas>
        <div id="radialHints" class="radial-hints" aria-hidden="true"></div>
      </div>
    </section>
  </main>
`;

const canvasFrame = document.querySelector<HTMLElement>('.canvas-frame');
const canvas = document.querySelector<HTMLCanvasElement>('#drawingCanvas');
const colorPicker = document.querySelector<HTMLInputElement>('#colorPicker');
const brushSize = document.querySelector<HTMLInputElement>('#brushSize');
const brushSizeValue = document.querySelector<HTMLOutputElement>('#brushSizeValue');
const clearCanvas = document.querySelector<HTMLButtonElement>('#clearCanvas');
const downloadCanvas = document.querySelector<HTMLButtonElement>('#downloadCanvas');
const toggleGuide = document.querySelector<HTMLButtonElement>('#toggleGuide');
const playGame = document.querySelector<HTMLButtonElement>('#playGame');
const backspace = document.querySelector<HTMLButtonElement>('#backspace');
const decoded = document.querySelector<HTMLOutputElement>('#decoded');
const guidePanel = document.querySelector<HTMLElement>('#guidePanel');
const canvasStage = document.querySelector<HTMLElement>('.canvas-stage');
const phraseInput = document.querySelector<HTMLInputElement>('#phraseInput');
const phrasePreview = document.querySelector<HTMLElement>('#phrasePreview');
const radialEl = document.querySelector<HTMLElement>('#radialHints');

if (
  !canvasFrame ||
  !canvas ||
  !canvasStage ||
  !colorPicker ||
  !brushSize ||
  !brushSizeValue ||
  !clearCanvas ||
  !downloadCanvas ||
  !toggleGuide ||
  !playGame ||
  !backspace ||
  !decoded ||
  !guidePanel ||
  !phraseInput ||
  !phrasePreview ||
  !radialEl
) {
  throw new Error('A drawing control was not found.');
}

// Populate the alphabet guide once; it stays visible alongside the canvas.
guidePanel.appendChild(buildGuide(colorPicker.value));

// Decoded text is an explicit accumulator: one continuous pen-down can produce
// many characters (a rightward motion commits the current one and starts the next).
let decodedText = '';

const renderDecoded = () => {
  decoded.value = decodedText;
};

const deleteLastLetter = () => {
  if (game.active()) {
    game.backspace();
    return;
  }
  decodedText = decodedText.slice(0, -1);
  renderDecoded();
};

// Commit the character formed by the current direction word (or run a command).
// While Speed Draw is running, committed characters are scored by the game
// instead of appended to the free-draw readout.
const commitCharacter = () => {
  const result = recognizeWord(currentWord);
  if (!result) {
    return;
  }
  if (game.active()) {
    if (result.kind === 'command') {
      game.backspace();
    } else {
      game.input(result.letter);
    }
    return;
  }
  if (result.kind === 'command') {
    decodedText = decodedText.slice(0, -1);
  } else {
    decodedText += result.letter;
  }
  renderDecoded();
};

const setGuideVisible = (visible: boolean) => {
  guidePanel.classList.toggle('is-collapsed', !visible);
  toggleGuide.setAttribute('aria-pressed', String(visible));
};

// Render typed text as a row of shorthand glyphs.
const renderPhrase = () => {
  const text = phraseInput.value.toUpperCase();
  const baseColor = colorPicker.value;
  phrasePreview.replaceChildren();

  for (const character of text) {
    if (character === ' ') {
      const space = document.createElement('span');
      space.className = 'phrase-space';
      phrasePreview.appendChild(space);
      continue;
    }

    const glyph = glyphForLetter(character, baseColor);
    const cell = document.createElement('span');
    cell.className = 'phrase-cell';

    if (glyph) {
      cell.appendChild(glyph);
    } else {
      cell.classList.add('phrase-cell--unknown');
      cell.textContent = character;
    }

    phrasePreview.appendChild(cell);
  }
};

const context = canvas.getContext('2d');

if (!context) {
  throw new Error('Canvas 2D rendering is not supported.');
}

// Touch/pen ("coarse") pointers are shakier and less precise than a mouse, so
// they get more generous jitter and gesture thresholds.
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

// Change the ink color whenever the drawing direction turns by more than this.
const TURN_THRESHOLD = Math.PI / 4; // 45 degrees
// Ignore tiny pointer jitter when measuring direction (CSS pixels).
const MIN_SEGMENT = coarsePointer ? 8 : 6;
// The rightward "advance to next character" gesture must be a SUSTAINED glide,
// not a single stray eastward sample — otherwise a finger drawing a slightly
// flat E/T/P (all diagonals that border due-east) gets read as an advance and
// the letter is lost. This is how much continuous rightward travel (CSS pixels)
// is required before the current character is committed and a new one begins.
const ADVANCE_TRAVEL = coarsePointer ? 26 : 20;

let isDrawing = false;
let lastPoint: Point | null = null;
let backingScale = window.devicePixelRatio || 1;

// Every completed stroke is retained here; the canvas is a view of this list.
const strokes: Stroke[] = [];
let currentStroke: Stroke | null = null;

// Ink used for a rightward "advance to next character" travel segment — a very
// low opacity gray so the connector between letters stays faint.
const SEPARATOR_COLOR = 'rgba(60, 60, 60, 0.14)';

// Direction tracking + the live stroke color derived from it.
let currentColor = colorPicker.value;
let lastDirection: number | null = null;
let directionAnchor: Point | null = null;
// The sequence of dominant directions drawn so far in the CURRENT character.
let currentWord: number[] = [];
// The raw points of the current character (excluding the rightward connector
// glide between characters). This is fed through the same smoothing/averaging
// recognizer the offline path uses — `strokeToWord` — so a shaky finger stroke
// self-corrects instead of being binned sample-by-sample.
let charPoints: Point[] = [];
// Accumulated sustained rightward travel toward an "advance" gesture (CSS px).
// Resets to 0 the moment motion stops heading due-east, so a brief eastward
// wobble inside a letter (or a rounded corner) never reaches ADVANCE_TRAVEL.
let eastRun = 0;
// True while moving rightward between characters (not part of any letter).
let traveling = false;

const getCanvasPoint = (event: PointerEvent): Point => {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
};

// Deterministic color from a heading: the angle maps straight onto the hue
// wheel, so a given direction always yields the same distinct color.
const colorForDirection = (direction: number): string => {
  const hue = (((direction * 180) / Math.PI) % 360 + 360) % 360;
  return `hsl(${hue}, 85%, 50%)`;
};

const directionIndex = (angle: number): number => {
  const degrees = (((angle * 180) / Math.PI) % 360 + 360) % 360;
  return Math.round(degrees / 45) % DIR_COUNT;
};

// Radial look-ahead hints, laid out as a tree rooted at the cursor:
//  - A letter one move away sits at radius R1 in that direction (a spoke).
//  - A letter two moves away is placed at the position you'd actually reach:
//    the first spoke's end point, then R2 further in the SECOND direction — so
//    each option is arranged radially around its first-stroke hint.
// R1 spreads the first-stroke spokes out; R2 (the second-move offset) must stay
// well under half the gap between adjacent spokes (~0.77*R1) so each 2-away
// letter stays clearly radial to its OWN first-stroke hint, not a neighbor.
const RADIAL_R1 = 88;
const RADIAL_R2 = 20;
// Directly-left direction (index 4). A lone leftward stroke is reserved as a
// no-op, so it gets an empty-circle hint rather than a letter.
const WEST = 4;
let renderedWordKey: string | null = null;

// Position a hint from its FULL canonical word: the first segment is a spoke at
// R1, an optional second segment hangs off it at R2. Depends only on the full
// word, so a hint keeps the same spot no matter how much has been drawn.
const chipPlacement = (full: number[]): { x: number; y: number; color: string; far: boolean } => {
  const firstAngle = dirAngle(full[0]);
  let x = Math.cos(firstAngle) * RADIAL_R1;
  let y = Math.sin(firstAngle) * RADIAL_R1;
  let color = dirColor(full[0]);
  const far = full.length >= 2;
  if (far) {
    const secondAngle = dirAngle(full[1]);
    x += Math.cos(secondAngle) * RADIAL_R2;
    y += Math.sin(secondAngle) * RADIAL_R2;
    color = dirColor(full[1]);
  }
  return { x, y, color, far };
};

const rebuildRadialChips = (word: number[]) => {
  radialEl.replaceChildren();
  // In Speed Draw, glow whichever hint leads to the letter the player needs.
  const glowLetter = game.active() ? game.targetLetter() : null;
  // The character that would actually be committed if the pointer lifts now —
  // the nearest match, not just an exact one — so it's highlighted even when the
  // drawn word is a little off. Held until a rightward advance or pointer-up.
  const pending = recognizeWord(word);
  const droppingLetter = pending?.kind === 'letter' ? pending.letter : null;
  let droppingShown = false;

  for (const { letter, ext } of reachableLetters(word)) {
    const full = word.concat(ext);
    const { x, y, color, far } = chipPlacement(full);

    const chip = document.createElement('span');
    if (letter === droppingLetter) {
      chip.className = 'radial-spoke radial-spoke--selected';
      chip.style.background = color;
      droppingShown = true;
    } else {
      chip.className = far ? 'radial-spoke radial-spoke--far' : 'radial-spoke';
      chip.style.color = color;
    }
    if (letter === glowLetter) {
      chip.classList.add('radial-spoke--target');
    }
    chip.textContent = letter;
    chip.style.setProperty('--x', `${x}px`);
    chip.style.setProperty('--y', `${y}px`);
    radialEl.appendChild(chip);
  }

  // If the drawn word overshoots or misses every canonical (so the letter that
  // will drop isn't among the reachable hints), still show it, highlighted, at
  // its own canonical position.
  if (droppingLetter && !droppingShown && ALPHABET[droppingLetter]) {
    const { x, y, color } = chipPlacement(ALPHABET[droppingLetter]);
    const chip = document.createElement('span');
    chip.className = 'radial-spoke radial-spoke--selected';
    chip.style.background = color;
    if (droppingLetter === glowLetter) {
      chip.classList.add('radial-spoke--target');
    }
    chip.textContent = droppingLetter;
    chip.style.setProperty('--x', `${x}px`);
    chip.style.setProperty('--y', `${y}px`);
    radialEl.appendChild(chip);
  }

  // Rightward is always "submit this character and start a new one".
  const advance = document.createElement('span');
  advance.className = 'radial-spoke radial-spoke--advance';
  advance.textContent = '→';
  advance.style.setProperty('--x', `${Math.cos(dirAngle(EAST)) * RADIAL_R1}px`);
  advance.style.setProperty('--y', `${Math.sin(dirAngle(EAST)) * RADIAL_R1}px`);
  radialEl.appendChild(advance);

  // Leftward at the start of a character is a reserved no-op — mark it with an
  // empty circle so stroke one shows every direction is accounted for.
  if (word.length === 0) {
    const noop = document.createElement('span');
    noop.className = 'radial-spoke radial-spoke--noop';
    noop.style.setProperty('--x', `${Math.cos(dirAngle(WEST)) * RADIAL_R1}px`);
    noop.style.setProperty('--y', `${Math.sin(dirAngle(WEST)) * RADIAL_R1}px`);
    radialEl.appendChild(noop);
  }
};

// The hint tree is anchored at the point where the CURRENT character began and
// held there for the whole character — it does not follow the pen. That keeps a
// two-stroke letter's hint fixed: its completed position (anchor + R1 in the
// second-stroke direction) is exactly where its one-away spoke sat during the
// first stroke, so the second-stroke hints never jump.
let radialAnchor: Point | null = null;

// Rebuild the chips only when the drawn word changes; the tree is laid out
// relative to the (fixed) character-start anchor.
const showRadialHints = () => {
  if (!radialAnchor) {
    return;
  }
  const key = currentWord.join(',');
  if (key !== renderedWordKey) {
    rebuildRadialChips(currentWord);
    renderedWordKey = key;
  }
  radialEl.style.left = `${radialAnchor.x}px`;
  radialEl.style.top = `${radialAnchor.y}px`;
  radialEl.classList.add('is-visible');
};

const hideRadialHints = () => {
  radialEl.classList.remove('is-visible');
  renderedWordKey = null;
  radialAnchor = null;
};

const applyBrush = () => {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = currentColor;
  context.lineWidth = Number(brushSize.value);
};

const paintBackground = () => {
  context.save();
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width / backingScale, canvas.height / backingScale);
  context.restore();
};

// Paint one retained stroke: a starting dot plus each colored segment.
const renderStroke = (stroke: Stroke) => {
  const { points, colors, size } = stroke;

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = size;

  context.beginPath();
  context.fillStyle = colors[0];
  context.arc(points[0].x, points[0].y, size / 2, 0, Math.PI * 2);
  context.fill();

  for (let i = 1; i < points.length; i += 1) {
    context.beginPath();
    context.strokeStyle = colors[i];
    context.moveTo(points[i - 1].x, points[i - 1].y);
    context.lineTo(points[i].x, points[i].y);
    context.stroke();
  }
};

const clearSurface = () => {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
};

// Re-render every stroke from scratch. Because strokes are stored as CSS-pixel
// vectors, this stays crisp across resizes and DPR changes.
const renderAll = () => {
  clearSurface();
  for (const stroke of strokes) {
    renderStroke(stroke);
  }
  paintBackground();
};

const resizeCanvas = () => {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = rect.width;
  const cssHeight = rect.height;
  const nextScale = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.round(cssWidth * nextScale));
  const nextHeight = Math.max(1, Math.round(cssHeight * nextScale));

  // Bail if nothing actually changed. Setting canvas.width/height clears the
  // bitmap, so resizing on every observer tick would wipe the canvas — and
  // observing a canvas we mutate can spin into an endless resize loop.
  if (nextWidth === canvas.width && nextHeight === canvas.height) {
    return;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;

  // Map CSS pixels -> device pixels using the REAL buffer/display ratio rather
  // than devicePixelRatio directly. If the two ever disagree (DPR change, zoom,
  // rounding), pointer coordinates and rendering stay in lockstep this way.
  backingScale = nextWidth / cssWidth;
  context.setTransform(nextWidth / cssWidth, 0, 0, nextHeight / cssHeight, 0, 0);

  renderAll();
};

const drawLine = (from: Point, to: Point) => {
  applyBrush();
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
};

const drawDot = (point: Point) => {
  applyBrush();
  context.beginPath();
  context.arc(point.x, point.y, Number(brushSize.value) / 2, 0, Math.PI * 2);
  context.fillStyle = currentColor;
  context.fill();
};

const startDrawing = (event: PointerEvent) => {
  // Stop iOS from treating the press-and-hold as a text selection / callout
  // gesture on the surrounding page while a stroke is in progress.
  event.preventDefault();
  isDrawing = true;
  canvas.setPointerCapture(event.pointerId);

  // In Speed Draw, each pen stroke gets a fresh surface so glyphs don't pile up.
  if (game.active()) {
    clearInk();
  }

  // Every stroke begins from the picked base color; a sharp turn recolors the
  // ink based on the new heading.
  currentColor = colorPicker.value;
  lastDirection = null;
  currentWord = [];
  eastRun = 0;
  traveling = false;

  lastPoint = getCanvasPoint(event);
  charPoints = [lastPoint];
  directionAnchor = lastPoint;
  // Anchor the hint tree where this character begins; it stays put until the
  // next character starts.
  radialAnchor = lastPoint;

  // Begin a new independent stroke object and retain it immediately.
  currentStroke = {
    size: Number(brushSize.value),
    points: [lastPoint],
    colors: [currentColor],
  };
  strokes.push(currentStroke);

  drawDot(lastPoint);
  // Show the eight starting directions right away.
  showRadialHints();
};

const continueDrawing = (event: PointerEvent) => {
  if (!isDrawing || !lastPoint || !currentStroke) {
    return;
  }

  const currentPoint = getCanvasPoint(event);

  // Sample direction over a minimum distance so jitter doesn't trigger changes.
  if (directionAnchor) {
    const dx = currentPoint.x - directionAnchor.x;
    const dy = currentPoint.y - directionAnchor.y;

    if (Math.hypot(dx, dy) >= MIN_SEGMENT) {
      const direction = Math.atan2(dy, dx);
      const index = directionIndex(direction);

      if (traveling) {
        // Gliding rightward toward the next character. The first clearly
        // non-eastward motion starts it; until then, stay in the connector.
        if (index !== EAST) {
          traveling = false;
          eastRun = 0;
          // Anchor the new character's shape at the connector's end and treat
          // this segment as its opening stroke (colored, not the faint gray).
          charPoints = [directionAnchor, currentPoint];
          currentWord = strokeToWord(charPoints);
          currentColor = colorForDirection(direction);
          lastDirection = direction;
          // Re-anchor the hint tree where this new character begins.
          radialAnchor = currentPoint;
        }
      } else if (index === EAST) {
        // Rightward travel accrues toward an advance. A single stray eastward
        // sample isn't enough — only a sustained glide past ADVANCE_TRAVEL
        // commits the character. These connector points are deliberately NOT
        // added to charPoints, so the letter's recognized shape excludes the
        // glide toward the next character.
        eastRun += dx;
        if (eastRun >= ADVANCE_TRAVEL) {
          commitCharacter();
          charPoints = [];
          currentWord = [];
          traveling = true;
          currentColor = SEPARATOR_COLOR;
        }
      } else {
        // Ordinary letter motion. Feed the accumulated character points through
        // the smoothing recognizer so the live word (used for both the hints and
        // the eventual commit) is the robust one, not a raw per-sample binning.
        eastRun = 0;
        charPoints.push(currentPoint);
        currentWord = strokeToWord(charPoints);

        // Recolor the ink on a real turn, same rule as before.
        const previous = lastDirection ?? direction;
        let turn = Math.abs(direction - previous);
        if (turn > Math.PI) {
          turn = 2 * Math.PI - turn;
        }
        if (lastDirection === null || turn > TURN_THRESHOLD) {
          currentColor = colorForDirection(direction);
        }
        lastDirection = direction;
      }

      directionAnchor = currentPoint;
    }
  }

  drawLine(lastPoint, currentPoint);

  // Record this segment (and its color) onto the current stroke object.
  currentStroke.points.push(currentPoint);
  currentStroke.colors.push(currentColor);

  lastPoint = currentPoint;
  showRadialHints();
};

const stopDrawing = (event: PointerEvent) => {
  isDrawing = false;
  hideRadialHints();

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  // Lifting commits the final character (unless we ended mid-advance).
  if (!traveling) {
    commitCharacter();
  }

  currentWord = [];
  charPoints = [];
  eastRun = 0;
  traveling = false;
  currentStroke = null;
  lastPoint = null;
};

const clearDrawing = () => {
  strokes.length = 0;
  currentStroke = null;
  currentWord = [];
  charPoints = [];
  eastRun = 0;
  traveling = false;
  decodedText = '';
  renderDecoded();
  renderAll();
};

const downloadDrawing = () => {
  paintBackground();

  const link = document.createElement('a');
  link.download = 'magic-ink-drawing.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// Wipe the ink (strokes + surface) without touching decoded text or game state.
const clearInk = () => {
  strokes.length = 0;
  currentStroke = null;
  clearSurface();
  paintBackground();
};

// Speed Draw challenge mode. Its HUD is inserted after the decoded readout, and
// its start/results overlays layer over the canvas stage.
const game = createGame({
  app: document.querySelector<HTMLElement>('.ink-app')!,
  hudAnchor: document.querySelector<HTMLElement>('.readout')!,
  stage: canvasStage,
  onClearCanvas: clearInk,
});

playGame.addEventListener('click', () => game.open());

brushSize.addEventListener('input', () => {
  brushSizeValue.value = brushSize.value;
});

toggleGuide.addEventListener('click', () => {
  setGuideVisible(guidePanel.classList.contains('is-collapsed'));
});

backspace.addEventListener('click', deleteLastLetter);
phraseInput.addEventListener('input', renderPhrase);

clearCanvas.addEventListener('click', clearDrawing);
downloadCanvas.addEventListener('click', downloadDrawing);
canvas.addEventListener('pointerdown', startDrawing, { passive: false });
canvas.addEventListener('pointermove', continueDrawing);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);
// Long-press on the canvas (iOS especially) pops the callout menu — block it.
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

// Default the guide open on desktop, but collapsed on small/mobile screens
// where it would otherwise crowd out the drawing area.
setGuideVisible(!window.matchMedia('(max-width: 720px)').matches);
renderDecoded();

// Observe the stage (not the frame) so the canvas re-syncs when the guide
// panel collapses/expands and the drawing area changes width.
const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvasStage);
resizeCanvas();

// devicePixelRatio changes (moving between monitors, browser zoom) don't fire
// the ResizeObserver, so re-sync the backing store when the ratio changes.
const watchPixelRatio = () => {
  const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  media.addEventListener(
    'change',
    () => {
      resizeCanvas();
      watchPixelRatio();
    },
    { once: true },
  );
};
watchPixelRatio();
