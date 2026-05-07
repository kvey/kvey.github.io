"use client";

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Nav from '@/components/nav';

type Project = {
  year: string;
  title: string;
  body: string;
};

type Role = {
  company: string;
  href?: string;
  role: string;
  period: string;
  summary?: string;
  projects?: Project[];
};

const roles: Role[] = [
  {
    company: 'Thousand Birds',
    href: 'https://thousandbirds.ai',
    role: 'Founder',
    period: '2023 - present',
    summary: 'Building the runtime layer for production AI agents. Backed by HF0.',
  },
  {
    company: 'Curative',
    href: 'https://curative.com',
    role: 'VP of Engineering',
    period: '2020 — 2023',
    summary:
      'Led engineering through pandemic-scale COVID operations and the pivot into a vertically integrated health plan: over $1B revenue in the first year of operation, 36M COVID tests, 2M immunizations, 40+ states, and a new health insurance product built under pressure. From 2022 onward this was primarily leadership: shaping teams, setting technical direction, and creating the management systems that let teams ship.',
    projects: [
      {
        year: '2020 — 2022',
        title: 'Pandemic-scale testing and immunization infrastructure',
        body:
          'Curative became a major US diagnostic testing provider: more than 36M COVID tests, more than 2M immunizations, operations across 40+ states, and testing services for US Congress. The engineering work was keeping high-volume healthcare operations, billing, reporting, support, and on-call systems moving while the company scaled fast.',
      },
      {
        year: '2020',
        title: 'Lab workflow improvements',
        body:
          'Contributed to DAT, Curative’s internal LIS, which replaced LimitLIS for core lab operations. I personally built the accessioning workflow, and the team built custom accessioning and plating interfaces that improved lab throughput by 4x, turning software workflow design into direct diagnostic capacity during the COVID response.',
      },
      {
        year: '2020 — 2023',
        title: 'Infrastructure, platform, and security direction',
        body:
          'Set technical direction across AWS multi-account, EKS goals, Buildkite and CI cleanup, Nexus, Sentry and observability, Tailscale, Auth0, AuthZed, Okta, IAM, PagerDuty, service tiers, and runbooks. Helped the organization achieve HIPAA and SOC 2 compliance while building the platform foundation teams needed for regulated healthcare software and legacy COVID and lab infrastructure.',
      },
      {
        year: '2021',
        title: 'Abbott Alinity lab-device integration',
        body:
          'Personally implemented the integration between Curative’s lab systems and Abbott Alinity devices, rapidly filling a critical operational gap in the lab. The work connected instrument output into our internal workflows so the lab could keep scaling without waiting on vendor or off-the-shelf LIS support.',
      },
      {
        year: '2022 — 2023',
        title: 'Engineering organization design and management',
        body:
          'Led the organizational design and operating cadence for the health-plan pivot: team topology, engineering managers, hiring and team growth, frontend/backend guilds, tech leads forum, performance reviews, project tracking, stakeholder communication, and the TSE bridge between engineering and operations.',
      },
      {
        year: '2022',
        title: 'Curative Health Plan pivot',
        body:
          'Led engineering through the company pivot from COVID testing into a vertically integrated health plan. The strategy was to own the full stack: member enrollment, claims processing, pharmacy benefits, provider networks, eligibility, member applications, admin tooling, and the operational workflows around them. My role was setting direction, organizing teams, clarifying priorities, and keeping execution moving across product, data, operations, and external stakeholders.',
      },
      {
        year: '2022',
        title: 'Mediview / VBA migration',
        body:
          'Led teams through the hardest legacy-system integration work: moving a Windows, IIS, SQL Server, Active Directory, FSx, AppStream, and VBA-based claims administration environment into Curative-controlled infrastructure. The migration required coordinating infrastructure, application engineering, claims administration, and vendor stakeholders so old claims software could support a modern health-plan launch.',
      },
      {
        year: '2022',
        title: 'EDI claims and eligibility processing',
        body:
          'Led the engineering investigation and delivery planning around the machinery behind health-plan transactions: 837 claim files, 834 eligibility files, 835 remittance, 277/271 flows, EDI staging databases, Automate scheduled tasks, VBA ingestion, file archives, and reporting. This was the unglamorous core of turning member and claims data into an operating plan.',
      },
      {
        year: '2022 — 2023',
        title: 'Member Portal',
        body:
          'Led teams building the member-facing health plan experience: onboarding, dashboard, claims views, family management, profile pages, member cards, Spanish translation, care-cost estimator work, and the shared UI patterns needed for multiple product teams to ship consistently.',
      },
      {
        year: '2022 — 2023',
        title: 'Provider search, directories, and TDI filings',
        body:
          'Led teams building and iterating on provider search, facility import, map UX, provider categorization, directory PDFs, network adequacy support, and regulatory filing workflows. This included coordinating engineering, product, data, and operations through repeated data cleanup and Texas Department of Insurance expansion requirements.',
      },
      {
        year: '2023',
        title: 'Baseline visit workflows',
        body:
          'Led teams through scheduling and plan-behavior workflows around Curative’s baseline visit model: Elation appointment webhooks, VBA status updates, due-date handling, multi-provider availability, coverage checks, and the operational logic connecting baseline visits to 0-copay eligibility.',
      },
      {
        year: '2022 — 2023',
        title: 'Pharmacy, formulary, and PBM integration',
        body:
          'Led cross-functional planning and delivery across formulary display, CapitalRx constraints, PBM data access, Surescripts investigation, First Databank / Medispan questions, RX invoicing, and tighter Curative pharmacy integration ideas such as refill support, pharmacist consults, and scheduling.',
      },
    ],
  },
  {
    company: 'Figma',
    href: 'https://www.figma.com/about',
    role: 'Software Engineer',
    period: '2018 — 2019',
    summary:
      'Worked on the multiplayer collaboration and editor/viewer performance that made Figma feel instant. Now FIG on the public markets.',
  },
  {
    company: 'Assembly (formerly GetScale)',
    href: 'https://asm.co',
    role: 'Co-Founder & CTO',
    period: '2014 — 2018 · YC S15',
    summary:
      'Co-founded out of Y Combinator. From 2014 to 2018 I led an international team in Redwood City and Shanghai — building practices around engineering, security, and operations; participating in hiring, culture, sales, and operations. The company began as GetScale (high-volume consumer electronics manufacturing) and became Assembly (fulfillment, sourcing, and process control).',
    projects: [
      {
        year: '2017',
        title: 'mDNS-based local peer discovery and console network',
        body:
          'Consoles further down an assembly line needed to be notified when units failed particular criteria — even when the facility had no internet. Consoles broadcast over mDNS, performed leader election, and replicated logs across one another. Clients queried local logs for the state of units the network had encountered. Consoles displayed notifications when they fell behind the shared log.',
      },
      {
        year: '2017',
        title: 'Source-controlled DevOps',
        body:
          'Required all developer operational tools to live and be documented in our source repository. Auditable management of changes to infrastructure. Kubernetes clusters in China and the US on separate cloud providers, defined initially with CloudFormation in a Clojure DSL, later Terraform.',
      },
      {
        year: '2017',
        title: 'Warehouse service sales and support',
        body:
          'Managed the migration and handover of multiple warehousing clients as we acquired the customer base of another organization. Participated in sales and support calls, solo and with the team.',
      },
      {
        year: '2016',
        title: 'Operating in bandwidth-limited environments',
        body:
          'Customers in rural locations had hard bandwidth limits. We tracked utilization and compressed video and image data on locally installed edge services. Because our systems collected very similar imagery from unit to unit, we pre-trained compression libraries against baselines and shipped diffs rather than whole resources. Console software updates used binary differences as well.',
      },
      {
        year: '2016',
        title: 'LCD character recognition',
        body:
          'To better instrument less sophisticated final assembly and QA processes, we built optical character recognition for the liquid-crystal displays on scales, calipers, and other existing equipment. Implemented with Tesseract and OpenCV.',
      },
      {
        year: '2016',
        title: 'QR code scanning performance',
        body:
          'Critical to operations as our systems moved into manufacturing process control and QA. Internal software for faster QR decoding, camera focus, and zoom; custom camera lenses, rangefinding, and programmable lighting on the hardware side.',
      },
      {
        year: '2016',
        title: 'Log ingestion and transport',
        body:
          'Ingested terabytes of temperature, orientation, and behavior data per day from consoles installed in the field. Online analysis and alerting on process behavior, offline analysis of factory conditions.',
      },
      {
        year: '2015',
        title: 'Event-sourced model with reactive queries',
        body:
          'Moved console management infrastructure to an eventually-consistent event-sourcing model. Queries defined in DataScript on the client; configurations stored in Datomic on the server. Single language (Clojure / ClojureScript) and single query language (Datalog) end-to-end. All events dispatched on the client were handled on the server in the same format and propagated to subscribed clients. Both sides operated over a normalized representation of the data.',
      },
      {
        year: '2015',
        title: 'Delay-tolerant networking infrastructure',
        body:
          'Service that managed multiple hops between particular geographically-located infrastructure providers and queued all intermediate data for reliable delivery into rural factories with constrained access to specific internet services.',
      },
      {
        year: '2014',
        title: 'Prototype quality control system',
        body:
          'Designed and built semi-custom touchscreen terminals with camera and sensor packages, deployed into factories in China and the US for data collection during QC processes. Initial customer base and a rudimentary system for managing the procedures shown on the consoles, manageable from the US. Got us into Y Combinator (Summer 2015).',
      },
      {
        year: '2014',
        title: 'Bill-of-materials optimization',
        body:
          'Visualize BoM pricing at varying production quantities and select quotations from multiple vendors. Accounted for break bulk, minimum order quantities, and unit quotations; allowed interactive part-selection and target-quantity adjustment. Backend initially in C, later multithreaded Clojure as we extended supplier coverage. Frontend in ClojureScript with interactive zooming across all parts in the BoM.',
      },
      {
        year: '2014',
        title: 'Product lifecycle management system',
        body:
          'Initial product at GetScale: hierarchical bill-of-material management, version control, and automated part quotation.',
      },
    ],
  },
  {
    company: 'CircuitHub',
    href: 'http://circuithub.com',
    role: 'Software Engineer',
    period: '2013 — 2014',
    summary: 'Small-volume electronics manufacturing. Worked on library management and a browser-based footprint/symbol editor for PCB design.',
  },
  {
    company: 'BlackJet',
    role: 'Software Engineer',
    period: '2013',
    summary: 'Uber for private jets. Built the charter booking interface and quote management infrastructure.',
  },
  {
    company: 'MixRank',
    href: 'http://mixrank.com',
    role: 'Software Engineer',
    period: '2012',
    summary: 'Competitive advertising analytics. Worked on the site redesign in Python / Pyramid / JavaScript.',
  },
  {
    company: 'Flint Mobile Payment',
    role: 'Software Engineer',
    period: '2012',
    summary: 'OCR-based mobile payments platform. Implemented bank transfer protocols in Node.js and the REST API.',
  },
];

const Page = () => {
  return (
    <>
      <Nav />
      <main className="relative">
        <div className="mx-auto max-w-3xl px-6 sm:px-10 pt-24 sm:pt-36 pb-32">

          <a href="/" className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted hover:text-accent transition-colors">
            ← Home
          </a>

          <header className="mt-12 mb-24">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent mb-6">
              Work history · 2012 — present
            </p>
            <h1 className="font-serif text-6xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              The long version.
            </h1>
            <p className="font-mono text-sm leading-relaxed mt-8 text-muted max-w-lg">
              Fourteen years of shipping. Most of it preserved from older notes — abridged where the original was repetitive, but otherwise as I wrote it at the time.
            </p>
          </header>

          <div>
            {roles.map((r, i) => (
              <section
                key={r.company}
                className={`relative ${i > 0 ? 'mt-24 sm:mt-28' : ''}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_2.2fr] gap-y-3 sm:gap-x-10 mb-12 pb-10 border-b border-rule/60">
                  <div>
                    {r.href ? (
                      <a
                        href={r.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="heading-link font-serif text-3xl sm:text-4xl leading-none"
                      >
                        {r.company}
                      </a>
                    ) : (
                      <span className="font-serif text-3xl sm:text-4xl leading-none text-ink">
                        {r.company}
                      </span>
                    )}
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-3">
                      {r.role}
                    </p>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted mt-1">
                      {r.period}
                    </p>
                  </div>
                  {r.summary && (
                    <p className="font-mono text-sm sm:text-base leading-relaxed text-ink sm:pt-1 max-w-xl">
                      {r.summary}
                    </p>
                  )}
                </div>

                {r.projects && (
                  <ProjectsSection company={r.company} projects={r.projects} />
                )}
              </section>
            ))}
          </div>

          <div className="mt-24 pt-10 border-t border-rule/60">
            <a href="/" className="mono-link font-mono text-[11px] uppercase tracking-[0.18em]">
              ← Home
            </a>
          </div>

        </div>
      </main>
    </>
  );
};

function ProjectsSection({ company, projects }: { company: string; projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const shortName = company.split(' ')[0];

  return (
    <div className="sm:pl-8 sm:border-l border-rule/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-accent hover:text-ink transition-colors"
      >
        <span>
          {open ? 'Hide' : 'Show'} projects at {shortName}
        </span>
        <span className="text-muted">·</span>
        <span className="text-muted">{projects.length}</span>
        <motion.span
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="inline-block"
          aria-hidden="true"
        >
          →
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="projects"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.25, ease: 'easeOut' },
            }}
            className="overflow-hidden"
          >
            <ul className="space-y-14 pt-12">
              {projects.map((p, idx) => (
                <motion.li
                  key={p.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 + idx * 0.025, ease: 'easeOut' }}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_2.2fr] gap-y-2 sm:gap-x-10"
                >
                  <div>
                    {p.year && (
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                        {p.year}
                      </p>
                    )}
                    <h3 className="font-serif text-xl sm:text-2xl leading-tight text-ink mt-1">
                      {p.title}
                    </h3>
                  </div>
                  <p className="font-mono text-sm leading-relaxed text-muted sm:pt-2 max-w-xl">
                    {p.body}
                  </p>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Page;
