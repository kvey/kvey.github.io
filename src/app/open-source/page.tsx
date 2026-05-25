import Nav from '@/components/nav';

interface Repo {
  id: string;
  title: string;
  description: string;
  tech: string;
  year: string;
  href: string;
  stars: number;
}

const repos: Repo[] = [
  {
    id: 'chidori',
    title: 'Chidori',
    description:
      'A reactive runtime for building durable AI agents. Chidori treats an agent as a reactive graph of cells — code, prompts, and tools — so execution is observable, replayable, and time-travel debuggable. Write across Python, JavaScript, and Rust in one program; pause, inspect, and resume long-running agent state instead of black-boxing it. The open-source core of the runtime that became Thousand Birds.',
    tech: 'Rust · reactive graph · LLM orchestration',
    year: '2026',
    href: 'https://github.com/ThousandBirdsInc/chidori',
    stars: 1346,
  },
  {
    id: 'tael',
    title: 'Tael',
    description:
      'An AI-agent-native observability platform. Tael ingests OpenTelemetry traces over standard OTLP gRPC, stores them in DuckDB, and exposes a CLI-first interface that returns structured JSON — built for agents like Claude Code to query, monitor, and annotate production telemetry programmatically. No dashboards, no browser: just a single binary and structured data.',
    tech: 'Rust · OpenTelemetry · DuckDB',
    year: '2026',
    href: 'https://github.com/ThousandBirdsInc/tael',
    stars: 0,
  },
  {
    id: 'starling',
    title: 'Starling',
    description:
      'A local dev orchestrator written in Rust — a fork/port of Tilt with portless-style named URLs built in, redesigned for agent-first engineering where many humans and agents run many environments in parallel. A central daemon owns one shared named-URL proxy and allocates ports so projects never collide, with a k9s-style TUI over every running instance. Stays protocol-compatible with Tilt’s React frontend.',
    tech: 'Rust · dev orchestration · TUI',
    year: '2026',
    href: 'https://github.com/ThousandBirdsInc/starling',
    stars: 0,
  },
  {
    id: 'reactive-palimpsest',
    title: 'Palimpsest',
    description:
      'A Postgres WAL-backed live query sync engine. Palimpsest keeps SQL result sets current from a logical replication stream and pushes row-level diffs to clients over its SyncEngine protocol — a Rust server, WAL decoder, SQL frontend, permission rewriter, and native + WASM clients in one repo. Convex-style live queries, open source and built directly on standard PostgreSQL as the source of truth.',
    tech: 'Rust · Postgres WAL · live queries',
    year: '2026',
    href: 'https://github.com/ThousandBirdsInc/reactive-palimpsest',
    stars: 0,
  },
];

export default function OpenSourcePage() {
  return (
    <>
      <Nav />
      <main className="relative overflow-x-clip">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          <header className="mb-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-6">
              Open source · {repos.length} projects
            </p>
            <h1 className="font-serif text-6xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              Code in the open.
            </h1>
            <p className="font-mono text-sm leading-relaxed mt-8 text-muted max-w-lg">
              The <a href="https://thousandbirds.ai" target="_blank" rel="noopener noreferrer" className="accent-link">Thousand Birds</a> stack — the runtime, observability, dev tooling, and data layer for production AI agents, mostly in Rust.
            </p>
          </header>

          {repos.map((r, i) => (
            <RepoEntry key={r.id} repo={r} index={i} />
          ))}

        </div>
      </main>
    </>
  );
}

function RepoEntry({ repo: r, index }: { repo: Repo; index: number }) {
  return (
    <div className={`relative ${index > 0 ? 'mt-24 sm:mt-28' : ''}`}>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2.2fr] gap-y-3 sm:gap-x-10 pb-10 border-b border-rule/60">
        <div>
          <a
            href={r.href}
            target="_blank"
            rel="noopener noreferrer"
            className="heading-link font-serif text-3xl sm:text-4xl leading-[1.05] text-left"
          >
            {r.title}
          </a>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-3">
            {r.tech}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">
            {r.year}
            {r.stars > 0 && <span className="text-accent"> · ★ {r.stars.toLocaleString()}</span>}
          </p>
        </div>
        <div className="sm:pt-1">
          <p className="font-mono text-sm sm:text-base leading-relaxed text-ink max-w-xl">
            {r.description}
          </p>
          <a
            href={r.href}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.18em]"
          >
            View on GitHub ↗
          </a>
        </div>
      </div>
    </div>
  );
}
