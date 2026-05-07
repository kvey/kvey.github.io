"use client";

import Nav from '@/components/nav';
import { useBackground, BackgroundType } from '@/components/background-provider';

type SketchKind = 'standalone' | 'background';

interface Sketch {
  id: BackgroundType | 'desert';
  title: string;
  description: string;
  tech: string;
  year: string;
  kind: SketchKind;
  href?: string;
}

const sketches: Sketch[] = [
  {
    id: 'desert',
    title: 'Desert',
    description: 'Procedurally generated Tucson desert. Layered terrain, scattered rocks, plants, and a hand-shaded sky. Fly the camera with WASD, drag to look around.',
    tech: 'Three.js · simplex-noise · lil-gui',
    year: '2026',
    kind: 'standalone',
    href: '/sketches/desert/index.html',
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
      <main className="relative">
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

  return (
    <div className={`relative ${index > 0 ? 'mt-24 sm:mt-28' : ''}`}>
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
    </div>
  );
}
