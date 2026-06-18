import Nav from '@/components/nav';
import WorkRow, { type Work } from '@/components/work-row';

const work: Work[] = [
  {
    company: 'Curative',
    href: 'https://curative.com',
    role: 'VP of Engineering',
    period: '2020 — 2023',
    headline: '36M COVID tests · over $1B revenue in year one · 7,000 people',
    body: 'Led engineering through the pandemic-era buildout. From a standing start to nationwide testing infrastructure, fast.',
    hoverImage: { src: '/work/curative.png', width: 1686, height: 1269, alt: 'curative.com — Curative health plan' },
  },
  {
    company: 'Figma',
    href: 'https://www.figma.com/about',
    role: 'Software Engineer',
    period: '2018 — 2019',
    headline: 'Multiplayer collaboration · editor and viewer performance',
    body: 'Worked on the systems that made Figma feel instant — the reason it became the tool every designer reaches for. Now FIG on the public markets.',
    hoverImage: { src: '/work/figma.png', width: 1679, height: 1256, alt: 'figma.com — Figma homepage' },
  },
  {
    company: 'Assembly',
    href: 'https://asm.co',
    role: 'Co-Founder & CTO',
    period: '2014 — 2018 · YC S15',
    headline: 'Quality control software for modern manufacturing',
    body: 'Co-founded out of YC to rebuild how factories catch defects in real time. Built consoles, networks, and ingestion across factories in the US and China.',
    hoverImage: { src: '/work/assembly.png', width: 1727, height: 1080, alt: 'asm.co — Assembly homepage' },
  },
];

const writing = [
  {
    date: '2026-04-13',
    href: '/blog/2026-04-13',
    title: 'Design Patterns in the Age of AI',
    lede: 'Which engineering patterns should change now that AI can read, write, and refactor code for us.',
  },
  {
    date: '2024-08-27',
    href: '/blog/2024-08-27',
    title: 'What is an AI Agent?',
    lede: 'Unraveling the hype and reclaiming the concept.',
  },
];

const Home = () => {
  return (
    <>
      <Nav />

      <main className="relative overflow-x-clip">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          {/* Hero */}
          <section className="mb-32 sm:mb-40">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted mb-8">
              Founder ·{' '}
              <a
                href="https://thousandbirds.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="mono-link"
              >
                Thousand Birds Inc
              </a>
              {' '}· San Francisco
            </p>

            <h1 className="font-serif text-[18vw] sm:text-[112px] leading-[0.92] tracking-tightest text-ink">
              Colton<br />
              <span className="text-accent">Pierson</span>
            </h1>

            <p className="font-serif text-2xl sm:text-3xl leading-snug mt-10 text-ink max-w-xl">
              Building the runtime layer for production AI agents.
            </p>

            <p className="font-mono text-sm leading-relaxed mt-8 text-muted max-w-lg">
              Fourteen years shipping infrastructure people rely on — at{' '}
              <a href="https://www.figma.com/about" target="_blank" rel="noopener noreferrer" className="accent-link">Figma</a>,{' '}
              <a href="https://curative.com" target="_blank" rel="noopener noreferrer" className="accent-link">Curative</a>, and{' '}
              <a href="https://asm.co" target="_blank" rel="noopener noreferrer" className="accent-link">Assembly</a>{' '}
              (YC S15). Now full-time on{' '}
              <a href="https://thousandbirds.ai" target="_blank" rel="noopener noreferrer" className="accent-link">Thousand Birds</a>, backed by{' '}
              <a href="https://www.hf0.com/" target="_blank" rel="noopener noreferrer" className="accent-link">HF0</a>.
            </p>
          </section>

          {/* Background */}
          <section className="mb-32 sm:mb-40">
            <SectionLabel>Background</SectionLabel>

            <div className="font-mono text-base leading-relaxed text-ink/85 space-y-5 max-w-2xl mt-8">
              <p>
                For fourteen years I&apos;ve worked <span className="text-accent">the same seam</span>: the gap between what software promises and what actually holds up in the real world.
              </p>
              <p>
                I started where bits hit atoms — building circuit boards in a browser, then the manufacturing and fulfillment to ship them at scale. That became{' '}
                <a href="https://asm.co" target="_blank" rel="noopener noreferrer" className="accent-link">Assembly</a>, which I co-founded and took through Y Combinator, running a team across Redwood City and Shanghai. Engineering, security, ops, hiring — all of it, at once. That taught me range.
              </p>
              <p>
                <a href="https://www.figma.com/about" target="_blank" rel="noopener noreferrer" className="accent-link">Figma</a> taught me the opposite: depth. Real-time multiplayer and performance, where the bar is &ldquo;the user never notices it was hard.&rdquo;
              </p>
              <p>
                In 2020 all of it got called up at once. I joined{' '}
                <a href="https://curative.com" target="_blank" rel="noopener noreferrer" className="accent-link">Curative</a> as VP of Engineering at the start of the pandemic — and we did over a billion in revenue the first year: 36 million COVID tests across 40-plus states. Then we turned around and built a health insurance company from scratch.
              </p>
              <p>
                Now I&apos;m building Thousand Birds — because the gap between a demo and something you can actually trust in production is the same gap I&apos;ve been closing my whole career.
              </p>
            </div>
          </section>

          {/* Now — Thousand Birds */}
          <section className="mb-32 sm:mb-40">
            <SectionLabel>2023 - Now</SectionLabel>

            <h2 className="font-serif text-5xl sm:text-6xl leading-[0.95] tracking-tight mt-6 mb-8">
              Thousand Birds.
            </h2>

            <div className="font-mono text-base leading-relaxed text-ink/85 space-y-5 max-w-2xl">
              <p>
                AI agents are going into production faster than the infrastructure to run them safely. Most teams are gluing together their own scaffolding — sandboxing, observability, retries, evals — instead of building the actual agent.
              </p>
              <p>
                Thousand Birds is the runtime that makes that scaffolding disappear. We give engineering teams the substrate to ship agents they can <span className="text-accent">actually trust in production</span> — and the visibility to know when they shouldn&apos;t.
              </p>
            </div>

            <div className="mt-10 flex items-center gap-x-6">
              <a
                href="https://thousandbirds.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link group font-mono text-xs uppercase tracking-[0.18em]"
              >
                Visit thousandbirds.ai
                <span className="inline-block ml-2 transition-transform group-hover:translate-x-1">→</span>
              </a>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                Backed by{' '}
                <a href="https://www.hf0.com/" target="_blank" rel="noopener noreferrer" className="mono-link">HF0</a>
              </span>
            </div>
          </section>

          {/* Selected work */}
          <section className="mb-32 sm:mb-40 pt-16 sm:pt-20">
            <SectionLabel>Selected work</SectionLabel>

            <ol className="mt-2 divide-y divide-rule/60">
              {work.map((entry) => (
                <WorkRow key={entry.company} entry={entry} />
              ))}
            </ol>

            <div className="mt-12">
              <a
                href="/work-history"
                className="nav-link inline-block font-serif text-base sm:text-lg"
              >
                Full work history, 2012 — present →
              </a>
            </div>
          </section>

          {/* Writing */}
          <section className="mb-32 sm:mb-40 pt-16 sm:pt-20">
            <SectionLabel>Writing</SectionLabel>

            <ul className="mt-2 divide-y divide-rule/60">
              {writing.map((post) => (
                <li key={post.href}>
                  <a href={post.href} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-2 sm:gap-x-8 py-8 group">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted sm:pt-2">
                      {post.date}
                    </p>
                    <div>
                      <h3 className="font-serif text-2xl sm:text-3xl leading-tight text-ink">
                        <span className="heading-link-target">
                          {post.title}
                        </span>
                      </h3>
                      <p className="font-mono text-sm leading-relaxed text-muted mt-3 max-w-xl">
                        {post.lede}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <a
                href="/blog"
                className="nav-link inline-block font-serif text-base sm:text-lg"
              >
                All writing →
              </a>
            </div>
          </section>

          {/* Contact / sign-off */}
          <section className="pt-16 border-t border-rule/60">
            <SectionLabel>Elsewhere</SectionLabel>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-y-6 sm:gap-x-10 font-mono text-sm">
              <ContactRow label="Email" href="mailto:colton@thousandbirds.ai" value="colton@thousandbirds.ai" />
              <ContactRow label="X" href="https://x.com/kveykva" value="@kveykva" />
              <ContactRow label="LinkedIn" href="https://www.linkedin.com/in/colton-pierson-00aab248/" value="in/colton-pierson" />
            </div>

            <p className="font-serif italic text-lg sm:text-xl leading-snug text-muted mt-20 max-w-xl">
              &ldquo;Sometimes magic is just someone spending more time on something than anyone else might reasonably expect.&rdquo;
              <span className="font-mono not-italic text-[11px] uppercase tracking-[0.18em] text-muted block mt-3">— Teller</span>
            </p>
          </section>

        </div>
      </main>
    </>
  );
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent">
      {children}
    </p>
  );
}

function ContactRow({ label, href, value }: { label: string; href: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-2">{label}</p>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="accent-link"
      >
        {value}
      </a>
    </div>
  );
}

export default Home;
