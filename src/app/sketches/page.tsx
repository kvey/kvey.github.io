"use client";

import { LineBreakDouble } from '@/components/linebreak';
import Nav from '@/components/nav';
import { useBackground, BackgroundType } from '@/components/background-provider';

interface Sketch {
  id: BackgroundType | 'desert';
  title: string;
  description: string;
  tech: string;
  href?: string;
}

const sketches: Sketch[] = [
  {
    id: 'desert',
    title: 'Desert',
    description: 'Procedurally generated Tucson desert — terrain, rocks, plants, sky. Fly with WASD, drag to look.',
    tech: 'Three.js · simplex-noise · lil-gui',
    href: '/sketches/desert/index.html',
  },
  {
    id: 'flocking',
    title: 'Flocking',
    description: 'Reynolds boids — separation, alignment, cohesion. Cursor scatters the flock.',
    tech: 'WebGL2 compute · ASCII arrows',
  },
  {
    id: 'fluid',
    title: 'Fluid',
    description: 'Navier–Stokes on the GPU with vorticity confinement. Ambient emitters, splat on click.',
    tech: 'WebGL2 · ASCII density ramp',
  },
  {
    id: 'simplex-noise',
    title: 'Simplex Noise',
    description: 'Seeded 2D simplex field, sampled to characters. Drifts continuously.',
    tech: 'CPU · Stefan Gustavson',
  },
  {
    id: 'prism',
    title: 'Prism',
    description: 'Light rays refracting through floating glass prisms — dispersion by wavelength.',
    tech: 'CPU · 2D ray tracing',
  },
  {
    id: 'solids',
    title: 'Solids',
    description: 'Tori, cones, and cubes rendered as luminance-shaded ASCII, slowly tumbling.',
    tech: 'CPU · 3D rasterization',
  },
];

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
    <div>
      <div className='flex flex-col items-center pb-24'>
        <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div className={"pb-40"}>
            <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
              <h1 className='text-4xl'> COLTON PIERSON </h1>
              <p className='text-xl pt-2'>
                Founder @ THOUSAND BIRDS INC
              </p>
              <LineBreakDouble/>
              <Nav />
            </div>

            <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
              <h2 className={"text-2xl"}>Sketches</h2>
              <p className="pt-2 text-gray-700 dark:text-gray-300">
                Generative pieces. Click one to view it fullscreen — the eye toggle in the top right brings the page back.
              </p>

              <table className="w-full my-4 lg:table block border-collapse">
                <thead className="lg:table-header-group hidden">
                  <tr className="border-b border-gray-300 dark:border-neutral-600">
                    <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Title</th>
                    <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Stack</th>
                    <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400">Description</th>
                  </tr>
                </thead>
                <tbody className="lg:table-row-group block">
                  {sketches.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => view(s)}
                      className={`lg:table-row flex flex-col mb-4 lg:mb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-900/60 transition-colors ${i < sketches.length - 1 ? 'border-b border-gray-200 dark:border-neutral-700' : ''}`}
                    >
                      <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                        <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Title</span>
                        <span className="underline text-blue-600 dark:text-blue-400">{s.title}</span>
                      </td>
                      <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3 text-gray-500 dark:text-neutral-400 text-sm">
                        <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Stack</span>
                        {s.tech}
                      </td>
                      <td className="lg:table-cell align-top block px-4 py-3">
                        <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Description</span>
                        {s.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
