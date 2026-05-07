import Nav from '@/components/nav';

const posts = [
  {
    date: '2026-04-13',
    href: '/blog/2026-04-13',
    title: 'Design Patterns in the Age of AI',
    kind: 'Essay',
    readTime: '12 min read',
    lede: 'Which engineering patterns should change now that AI can read, write, and refactor code for us.',
  },
  {
    date: '2024-08-27',
    href: '/blog/2024-08-27',
    title: 'What is an AI Agent?',
    kind: 'Essay',
    readTime: '8 min read',
    lede: 'Unraveling the hype and reclaiming the concept. A definition of agency rooted in the capacity for failure and initiative.',
  },
  {
    date: '2024-07-09',
    href: '/blog/2024-07-09',
    title: 'Opinions',
    kind: 'Note',
    readTime: '3 min read',
    lede: 'A distillation of accumulated takes on engineering, leadership, and AI. Strong opinions, weakly held.',
  },
];

export default function BlogPage() {
  return (
    <>
      <Nav />
      <main className="relative">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          <header className="mb-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-6">
              Writing · {posts.length} pieces
            </p>
            <h1 className="font-serif text-6xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              Notes &amp; essays.
            </h1>
            <p className="font-mono text-sm leading-relaxed mt-8 text-muted max-w-lg">
              Long-form thinking on the systems we build — mostly around AI agents, engineering practice, and the patterns that change when the cost of writing code drops.
            </p>
          </header>

          <ul className="divide-y divide-rule/60 border-t border-rule/60">
            {posts.map((post) => (
              <li key={post.href}>
                <article className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-3 sm:gap-x-10 py-12 sm:py-14">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                      {post.date}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">
                      {post.kind} · {post.readTime}
                    </p>
                  </div>

                  <div>
                    <h2>
                      <a
                        href={post.href}
                        className="heading-link font-serif text-3xl sm:text-4xl leading-[1.1]"
                      >
                        {post.title}
                      </a>
                    </h2>
                    <p className="font-mono text-sm leading-relaxed text-muted mt-4 max-w-xl">
                      {post.lede}
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>

        </div>
      </main>
    </>
  );
}
