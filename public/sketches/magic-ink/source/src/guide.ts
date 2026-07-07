// Renders the alphabet guide: one card per letter showing the shorthand glyph
// (start dot + direction-colored segments), plus the scratch-out delete gesture.
// Retrace letters (draw out then back) are bowed apart so both colors show.

import { ALPHABET, DIR_COUNT, dirColor, dirVector, type Vec } from './alphabet';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GLYPH_LENGTH = 100;
const STROKE_WIDTH = 14;
const PADDING = 26;
const RETRACE_SEP = 36;

type Seg = { x1: number; y1: number; x2: number; y2: number; color: string; width: number };

const cursor2seg = (from: Vec, to: Vec) => ({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });

const isReversal = (a: number, b: number): boolean => (a + 4) % DIR_COUNT === b;

// Assemble the SVG from explicit colored segments plus a base-color start dot.
const svgFromSegments = (segments: Seg[], start: Vec, baseColor: string): SVGSVGElement => {
  const xs = segments.flatMap((s) => [s.x1, s.x2]).concat(start.x);
  const ys = segments.flatMap((s) => [s.y1, s.y2]).concat(start.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX || 1;
  const height = Math.max(...ys) - minY || 1;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute(
    'viewBox',
    `${minX - PADDING} ${minY - PADDING} ${width + PADDING * 2} ${height + PADDING * 2}`,
  );

  for (const s of segments) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(s.x1));
    line.setAttribute('y1', String(s.y1));
    line.setAttribute('x2', String(s.x2));
    line.setAttribute('y2', String(s.y2));
    line.setAttribute('stroke', s.color);
    line.setAttribute('stroke-width', String(s.width));
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);
  }

  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', String(start.x));
  dot.setAttribute('cy', String(start.y));
  dot.setAttribute('r', String(STROKE_WIDTH * 0.7));
  dot.setAttribute('fill', baseColor);
  svg.appendChild(dot);

  return svg;
};

// Build a letter glyph, bowing retrace (reversal) segments apart for legibility.
const buildLetterGlyph = (word: number[], baseColor: string): SVGSVGElement => {
  const segments: Seg[] = [];
  let cursor: Vec = { x: 0, y: 0 };
  const start = cursor;

  for (let i = 0; i < word.length; i += 1) {
    const v = dirVector(word[i]);

    if (i > 0 && isReversal(word[i], word[i - 1])) {
      // Offset the return path perpendicular to the heading, with a faint
      // connector, so the overlapping out/back strokes read as two lines.
      const perp = { x: -v.y, y: v.x };
      const shifted = { x: cursor.x + perp.x * RETRACE_SEP, y: cursor.y + perp.y * RETRACE_SEP };
      segments.push({ ...cursor2seg(cursor, shifted), color: 'rgba(23,32,51,0.16)', width: STROKE_WIDTH * 0.45 });
      cursor = shifted;
    }

    const to = { x: cursor.x + v.x * GLYPH_LENGTH, y: cursor.y + v.y * GLYPH_LENGTH };
    segments.push({ ...cursor2seg(cursor, to), color: dirColor(word[i]), width: STROKE_WIDTH });
    cursor = to;
  }

  return svgFromSegments(segments, start, baseColor);
};

// Delete gesture glyph: a vertical scratch-out, colored by pass direction.
const buildBackspaceGlyph = (baseColor: string): SVGSVGElement => {
  const points: Vec[] = [
    { x: 0, y: 0 },
    { x: 16, y: 100 },
    { x: 32, y: 0 },
    { x: 48, y: 100 },
    { x: 64, y: 0 },
  ];
  const segments: Seg[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const dir = points[i].y > points[i - 1].y ? 2 : 6;
    segments.push({ ...cursor2seg(points[i - 1], points[i]), color: dirColor(dir), width: STROKE_WIDTH });
  }
  return svgFromSegments(segments, points[0], baseColor);
};

// Advance gesture glyph: a rightward dash (submit character, start a new one).
const buildAdvanceGlyph = (baseColor: string): SVGSVGElement => {
  const segments: Seg[] = [
    { x1: 0, y1: 0, x2: 100, y2: 0, color: '#a39d90', width: STROKE_WIDTH },
  ];
  return svgFromSegments(segments, { x: 0, y: 0 }, baseColor);
};

// Glyph for a single letter, or null if the character isn't in the alphabet.
export const glyphForLetter = (letter: string, baseColor: string): SVGSVGElement | null => {
  const word = ALPHABET[letter];
  return word ? buildLetterGlyph(word, baseColor) : null;
};

const makeCard = (glyph: SVGSVGElement, label: string, meta: string, extraClass = ''): HTMLElement => {
  const card = document.createElement('div');
  card.className = `guide-card${extraClass ? ` ${extraClass}` : ''}`;
  card.appendChild(glyph);

  const labelEl = document.createElement('div');
  labelEl.className = 'guide-letter';
  labelEl.textContent = label;
  card.appendChild(labelEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'guide-meta';
  metaEl.textContent = meta;
  card.appendChild(metaEl);

  return card;
};

// Build the full A–Z guide grid plus the delete gesture.
export const buildGuide = (baseColor: string): HTMLElement => {
  const grid = document.createElement('div');
  grid.className = 'guide-grid';

  for (const letter of Object.keys(ALPHABET).sort()) {
    const word = ALPHABET[letter];
    grid.appendChild(makeCard(buildLetterGlyph(word, baseColor), letter, `${word.length} seg`));
  }

  grid.appendChild(makeCard(buildAdvanceGlyph(baseColor), '→', 'next char', 'guide-card--command'));
  grid.appendChild(makeCard(buildBackspaceGlyph(baseColor), '⌫', 'scratch out', 'guide-card--command'));

  return grid;
};
