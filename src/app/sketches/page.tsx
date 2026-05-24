"use client";

import { useRef } from 'react';
import Nav from '@/components/nav';
import HoverImage from '@/components/hover-image';
import { useBackground, BackgroundType } from '@/components/background-provider';

type SketchKind = 'standalone' | 'background';

interface Sketch {
  id: BackgroundType | 'desert' | 'glass' | 'plant-lab' | 'itano-circus';
  title: string;
  description: string;
  tech: string;
  year: string;
  kind: SketchKind;
  href?: string;
  hoverImage?: { src: string; width: number; height: number; alt: string };
}

const sketches: Sketch[] = [
  {
    id: 'itano-circus',
    title: 'Itano Circus',
    description: 'A client-side cyberpunk Three.js arcade sketch about flying above a procedurally generated 3D wireframe city toward a marked target tower while surviving simultaneous homing missile volleys. The geometry stays deliberately simple: an asymmetric banking fighter, missile cones, flare decoys, neon trails, wireframe buildings, rooftop grids, traffic dashes, antennas, and route lines.',
    tech: 'Three.js · arcade physics · homing swarms',
    year: '2026',
    kind: 'standalone',
    href: '/sketches/itano-circus/index.html',
  },
  {
    id: 'glass',
    title: 'Stained Glass',
    description: 'Drop in any image and it gets re-cut the way a glazier would: K-means posterizes the source into a small palette, the assignment map is median-smoothed to round the region edges, then Poisson-disk Voronoi sub-cells subdivide the flat regions. Connected components on the (palette, sub-cell) composite become pieces — boundaries snap to content edges, flat areas get deliberate cuts, lead came runs every seam. The glass texture is projected through the plane along the sun direction to pool colored light on the floor and the view ray is raymarched through a bounding box of dust for god-rays.',
    tech: 'Three.js · Voronoi · custom gobo shader',
    year: '2026',
    kind: 'standalone',
    href: '/sketches/glass/index.html',
  },
  {
    id: 'desert',
    title: 'Desert',
    description: 'Procedurally generated Tucson desert, built as a zen garden out of love for Tucson and the desert. In memory of my brother Larry William Pierson (1966-2025) and my Aunt Alice Gutierrez, born Alice Pierson (1949-2026). Layered terrain, scattered rocks, plants, and sky.',
    tech: 'Three.js · simplex-noise · lil-gui',
    year: '2026',
    kind: 'standalone',
    href: '/sketches/desert/index.html',
    hoverImage: { src: '/work/desert.png', width: 1690, height: 1172, alt: 'Tucson desert sketch' },
  },
  {
    id: 'plant-lab',
    title: 'Plant Lab',
    description: 'A focused sandbox for the desert sketch plant system, with interactive controls for inspecting and tuning Sonoran plant forms.',
    tech: 'Three.js · procedural plants · lil-gui',
    year: '2026',
    kind: 'standalone',
    href: '/sketches/desert/plant-lab.html',
    hoverImage: { src: '/work/desert.png', width: 1690, height: 1172, alt: 'Plant lab sketch' },
  },
  {
    id: 'flocking',
    title: 'Flocking',
    description: "Reynolds boids — separation, alignment, cohesion. The cursor scatters the flock. Rendered as a field of ASCII arrows oriented to each boid's heading.",
    tech: 'WebGL2 compute · ASCII arrows',
    year: '2026',
    kind: 'background',
  },
  {
    id: 'fluid',
    title: 'Fluid',
    description: 'Navier–Stokes on the GPU with vorticity confinement. Ambient emitters keep things moving; click to splat new density into the field.',
    tech: 'WebGL2 · ASCII density ramp',
    year: '2026',
    kind: 'background',
  },
  {
    id: 'simplex-noise',
    title: 'Simplex Noise',
    description: 'A seeded 2D simplex field, sampled to characters and quietly drifting in time. The classic procedural primitive, made visible.',
    tech: 'CPU · Stefan Gustavson',
    year: '2025',
    kind: 'background',
  },
  {
    id: 'prism',
    title: 'Prism',
    description: 'Light rays refracting through floating glass prisms — dispersion by wavelength splits white light into a spectrum.',
    tech: 'CPU · 2D ray tracing',
    year: '2025',
    kind: 'background',
  },
  {
    id: 'solids',
    title: 'Solids',
    description: 'Tori, cones, and cubes rendered as luminance-shaded ASCII, slowly tumbling. Old-school 3D rasterization for the terminal era.',
    tech: 'CPU · 3D rasterization',
    year: '2025',
    kind: 'background',
  },
];

const standaloneSketches = sketches.filter((s) => s.kind === 'standalone');
const backgroundSketches = sketches.filter((s) => s.kind === 'background');

export default function SketchesPage() {
  const { setBackground, setContentHidden } = useBackground();

  const view = (s: Sketch) => {
    if (s.href) {
      window.location.href = s.href;
      return;
    }
    setBackground(s.id as BackgroundType);
    setContentHidden(true);
  };

  return (
    <>
      <Nav />
      <main className="relative overflow-x-clip">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          <header className="mb-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-6">
              Sketches · {sketches.length} pieces
            </p>
            <h1 className="font-serif text-6xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              Generative pieces.
            </h1>
            <p className="font-mono text-sm leading-relaxed mt-8 text-muted max-w-lg">
              Two kinds: <span className="text-ink">standalone pages</span> with their own controls, and <span className="text-ink">site backgrounds</span> that take over this page in place. The eye toggle in the bottom right brings the chrome back when you&apos;re done.
            </p>
          </header>

          {/* Standalone pages */}
          <section className="mb-32 sm:mb-40">
            <div className="flex items-baseline gap-x-3 mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                Standalone pages
              </p>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                · {standaloneSketches.length} · navigate away
              </span>
            </div>

            {standaloneSketches.map((s, i) => (
              <SketchEntry key={s.id} sketch={s} onView={view} index={i} />
            ))}
          </section>

          {/* Backgrounds */}
          <section>
            <div className="flex items-baseline gap-x-3 mb-12">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
                Site backgrounds
              </p>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                · {backgroundSketches.length} · take over this page
              </span>
            </div>

            {backgroundSketches.map((s, i) => (
              <SketchEntry key={s.id} sketch={s} onView={view} index={i} />
            ))}
          </section>

        </div>
      </main>
    </>
  );
}

function SketchEntry({
  sketch: s,
  onView,
  index,
}: {
  sketch: Sketch;
  onView: (s: Sketch) => void;
  index: number;
}) {
  const isStandalone = s.kind === 'standalone';
  const cta = isStandalone ? 'Open page ↗' : 'Set as background →';
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={`relative ${index > 0 ? 'mt-24 sm:mt-28' : ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2.2fr] gap-y-3 sm:gap-x-10 pb-10 border-b border-rule/60">
        <div>
          <button
            type="button"
            onClick={() => onView(s)}
            className="heading-link font-serif text-3xl sm:text-4xl leading-[1.05] text-left"
          >
            {s.title}
          </button>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-3">
            {s.tech}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">
            {s.year}
          </p>
        </div>
        <div className="sm:pt-1">
          <p className="font-mono text-sm sm:text-base leading-relaxed text-ink max-w-xl">
            {s.description}
          </p>
          <button
            type="button"
            onClick={() => onView(s)}
            className="nav-link mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.18em]"
          >
            {cta}
          </button>
        </div>
      </div>

      {s.hoverImage && <HoverImage image={s.hoverImage} containerRef={ref} />}
    </div>
  );
}
