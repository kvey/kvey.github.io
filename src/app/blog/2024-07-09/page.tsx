import Nav from '@/components/nav';

const Page = () => {
  return (
    <>
      <Nav />
      <main className="relative">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          <a href="/blog" className="mono-link font-mono text-[11px] uppercase tracking-[0.18em]">
            ← All writing
          </a>

          <header className="mt-12 mb-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-6">
              2024-07-09 · Note
            </p>
            <h1 className="font-serif text-6xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              Opinions.
            </h1>
            <p className="font-serif text-2xl sm:text-3xl leading-snug mt-10 text-ink max-w-xl">
              A distillation of accumulated takes — strong opinions, weakly held.
            </p>
          </header>

          <article className="prose-editorial font-mono">
            <h2>Engineering</h2>
            <ul>
              <li>
                I would rather use a typed language than an untyped one. I&apos;ve used Python, JavaScript, TypeScript, Clojure, Rust, and Kotlin in production.
              </li>
              <li>
                Lean hard on static analysis, types, and tests to thoroughly validate your code.
              </li>
            </ul>

            <h2>Leadership</h2>
            <ul>
              <li>
                Engineering is fundamentally about people. I care about how you feel — satisfaction, mental state, well-being. Happy, focused, driven people are the most productive, the best to work with, and the ones who help others do their best work.
              </li>
              <li>
                I believe in essence and getting to the heart of things — reuse and systems thinking. I enjoy debugging, building mental models, and getting to the root of issues. I find joy in building those models with you, and I&apos;m excited when I see you do the same.
              </li>
              <li>
                I believe in bias to action. Our best option is to keep learning, explore the environment, and reduce unknowns. Action short-circuits debate, and I think that&apos;s the right tradeoff. I&apos;d rather we do something 50% wrong but learn something than wait and do something perfectly after a long delay. Incremental change and course correction beats initial precision.
              </li>
            </ul>

            <h2>AI</h2>
            <ul>
              <li>
                The anthropomorphism of AI is a net-negative for humanity. Pundits are deliberately misinforming users about what these systems can and can&apos;t do.
              </li>
            </ul>
          </article>

        </div>
      </main>
    </>
  );
};

export default Page;
