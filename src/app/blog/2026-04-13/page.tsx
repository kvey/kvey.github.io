const Home = () => {
  return (
      <div>
        <div className='flex flex-col items-center mx-4'>
          <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
            <a href={"/"} className={"text-blue-600 dark:text-blue-400 underline"}>
              {"<<< Back"}
            </a>
            <div className={"pb-40"}>
              <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                <h1 className='text-4xl'> Design Patterns in the Age of AI </h1>
                <p className='text pt-4'>
                  A lot of engineering advice is really risk management around the cost of human labor.
                  AI changes that cost, so some of the advice is now wrong and some is more right than
                  before. Here is my attempt to say which is which.
                </p>
              </div>

              <main>
                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">The Economics of Writing Code Changed</h2>
                  <p className="mb-4">
                    The cost of producing a line of working code has dropped by something like an order
                    of magnitude in two years, and it is not going back up. AI-assisted coding is here
                    to stay, and the current generation of models is genuinely good. Not &quot;good
                    enough for a demo&quot; good. Good enough that a senior engineer paired with one
                    can outship a team of five from 2022, on real systems, in production.
                  </p>
                  <p className="mb-4">
                    That is the shift the rest of this post is reacting to. When the price of writing,
                    translating, and rewriting code falls that far, the patterns that were optimal at
                    the old price are not optimal at the new one. Some of the things we skipped because
                    they were too expensive now pay for themselves. Some of the things we did because
                    they saved keystrokes are now just making the code harder to read. The question
                    worth asking on every architectural decision is: what did I previously avoid
                    because we couldn&apos;t afford the time for humans to type it?
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">METR&apos;s Task-Length Benchmark</h2>
                  <p className="mb-4">
                    If you want the shortest possible version of why this matters, it is METR&apos;s
                    time-horizon benchmark. They measure the length of software task, in human-expert
                    time, that a frontier model can complete autonomously with 50% success. The length
                    has been doubling roughly every 7 months since 2019, and the doubling rate has
                    actually been accelerating since 2024.
                  </p>
                  <div className="my-8">
                    <svg viewBox="0 0 760 420" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="METR 50% time horizon by model, 2019 to 2025">
                      <rect x="60" y="40" width="660" height="320" fill="none" stroke="currentColor" strokeOpacity="0.15"/>
                      <g stroke="currentColor" strokeOpacity="0.08">
                        <line x1="60" y1="302" x2="720" y2="302"/>
                        <line x1="60" y1="240" x2="720" y2="240"/>
                        <line x1="60" y1="160" x2="720" y2="160"/>
                        <line x1="60" y1="98" x2="720" y2="98"/>
                        <line x1="60" y1="50" x2="720" y2="50"/>
                      </g>
                      <g className="fill-gray-600 dark:fill-gray-400" fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="end">
                        <text x="54" y="306">10 sec</text>
                        <text x="54" y="244">1 min</text>
                        <text x="54" y="164">10 min</text>
                        <text x="54" y="102">1 hr</text>
                        <text x="54" y="54">4 hr</text>
                      </g>
                      <g className="fill-gray-600 dark:fill-gray-400" fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="middle">
                        <text x="60" y="380">2019</text>
                        <text x="150" y="380">2020</text>
                        <text x="247" y="380">2021</text>
                        <text x="345" y="380">2022</text>
                        <text x="443" y="380">2023</text>
                        <text x="541" y="380">2024</text>
                        <text x="638" y="380">2025</text>
                      </g>
                      <line x1="60" y1="344" x2="720" y2="66" stroke="currentColor" strokeOpacity="0.3" strokeDasharray="4 4"/>
                      <text x="716" y="60" className="fill-gray-500 dark:fill-gray-400" fontSize="10" fontFamily="ui-monospace, monospace" textAnchor="end">7-month doubling</text>
                      <g fill="rgb(37 99 235)">
                        <circle cx="60" cy="344" r="4"/>
                        <circle cx="361" cy="240" r="4"/>
                        <circle cx="459" cy="184" r="4"/>
                        <circle cx="524" cy="168" r="4"/>
                        <circle cx="573" cy="144" r="4"/>
                        <circle cx="581" cy="139" r="4"/>
                        <circle cx="614" cy="121" r="4"/>
                        <circle cx="646" cy="104" r="4"/>
                        <circle cx="671" cy="84" r="4"/>
                        <circle cx="720" cy="43" r="4"/>
                      </g>
                      <g className="fill-gray-700 dark:fill-gray-200" fontSize="10" fontFamily="ui-monospace, monospace">
                        <text x="68" y="348">GPT-2 (~2s)</text>
                        <text x="369" y="244">GPT-3.5 (~1m)</text>
                        <text x="459" y="178" textAnchor="middle">GPT-4 (~5m)</text>
                        <text x="524" y="162" textAnchor="middle">GPT-4 Turbo (~8m)</text>
                        <text x="560" y="132" textAnchor="end">GPT-4o (~16m)</text>
                        <text x="600" y="139">Claude 3.5 (~18m)</text>
                        <text x="622" y="115">3.5 new (~30m)</text>
                        <text x="640" y="98" textAnchor="end">3.7 (~50m)</text>
                        <text x="665" y="78" textAnchor="end">Opus 4 (~1.5h)</text>
                        <text x="714" y="37" textAnchor="end">Opus 4.5 (~4.8h)</text>
                      </g>
                    </svg>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                      50% time horizon on METR&apos;s task suite, by model release date. Log scale.
                      Data: <a className="underline" href="https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/" target="_blank" rel="noopener">METR, 2025</a>.
                    </p>
                  </div>
                  <p className="mb-4">
                    Six years ago, frontier models could handle tasks that take a human two seconds.
                    Today they handle tasks that take a human most of a workday, at the 50% mark, and
                    the 80% mark is tracing the same curve a few months behind. If you draw a straight
                    line on this chart, the argument about rewriting architecture around AI goes from
                    speculative to obvious.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Skipping the Old Advice</h2>
                  <p className="mb-4">
                    Some of what gets called &quot;new AI-era advice&quot; is old advice that was already
                    correct. Prefer duplication to the wrong abstraction. Avoid deep inheritance. Don&apos;t
                    build a strategy hierarchy for a second implementation that may never exist. Sandi Metz
                    was saying this in 2014. AI lowers the cost of getting it wrong, which makes the advice
                    matter a little less, not more. I&apos;ll skip past it.
                  </p>
                  <p className="mb-4">
                    The interesting question is the other direction: which of the heavyweight patterns
                    we used to skip because they cost too much in human time are suddenly worth reaching
                    for?
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Bounded Contexts and Inversion of Control</h2>
                  <p className="mb-4">
                    Domain-driven design has been around for twenty years and most teams still do not
                    practice it rigorously. Drawing bounded contexts, defining aggregates, and enforcing
                    the boundaries between them is a lot of upfront work for a CRUD app. Most teams
                    skipped it for the same reason they skipped event sourcing: the labor cost did not
                    justify the payoff.
                  </p>
                  <p className="mb-4">
                    That changes when the codebase has a non-human author who can see exactly as much
                    of the system as you show it, and no more. An AI working inside a well-drawn bounded
                    context has a finite set of types, a clear aggregate root, and explicit interfaces
                    at the edges. It cannot accidentally reach across into billing logic while editing
                    the shipping module, because the import does not exist. You know the blast radius
                    of any AI-authored change by looking at the context map, not by reading every line
                    of the diff.
                  </p>
                  <p className="mb-4">
                    Inversion of control reinforces this. When a module declares its dependencies
                    through constructor injection or a trait boundary rather than importing concrete
                    implementations, you can hand the AI that module in isolation. It does not need to
                    know what the real database client looks like to write business logic against the
                    interface. You scope the AI&apos;s working set the same way you scope a unit test:
                    invert the control and hand it only what it needs.
                  </p>
                  <p className="mb-4">
                    This is not free either. Drawing the wrong context boundaries is worse than drawing
                    none, and refactoring a monolith into bounded contexts is real work even with AI
                    help. The payoff is that once the boundaries exist, every future AI-authored change
                    is cheaper to review and safer to ship.
                  </p>
                  <p className="mb-4">
                    Example. A monolith has an <code>OrderService</code> that imports
                    <code>{' InventoryClient'}</code>, <code>{' PaymentGateway'}</code>,
                    <code>{' NotificationSender'}</code>, and <code>{' AuditLogger'}</code> directly.
                    An AI editing that file needs to understand all four dependencies, their side
                    effects, and their error modes. Refactored: <code>OrderService</code> lives in the
                    orders bounded context, takes four interfaces through its constructor, and the
                    context boundary enforces that nothing outside is directly reachable. The AI modifies
                    order logic, runs the tests with fakes, and produces a working change without ever
                    touching payments or inventory code.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Event Sourcing Earns Its Cost</h2>
                  <p className="mb-4">
                    Event sourcing means storing the sequence of state changes instead of the current
                    state. It is not free. Schema evolution is real work. GDPR deletion against an
                    append-only log is awkward. Projection rebuilds take hours on a big dataset, and you
                    are usually running a second storage system for the read side. None of that has gone
                    away. What has changed is the part that used to dominate the budget: writing the event
                    types, the handlers, the projections, and the tedious migration code. That part is now
                    the cheapest piece of the project.
                  </p>
                  <p className="mb-4">
                    In return you get an auditable record of what an AI agent did to your system. A row
                    that says a customer is on the Pro plan does not tell you which agent run upgraded
                    them or why. A log entry that says
                    <code>{' PlanUpgraded(customer=123, from=Free, to=Pro, actor=billing-agent, reason="retry of failed webhook", trace_id=...)'}</code>
                    does.
                  </p>
                  <p className="mb-4">
                    Example. Instead of an <code>orders</code> table you mutate in place, emit
                    <code>{' OrderPlaced'}</code>, <code>{' OrderLineAdded'}</code>,
                    <code>{' OrderDiscountApplied'}</code>, <code>{' OrderPaid'}</code>,
                    <code>{' OrderShipped'}</code>. &quot;Current state&quot; is a projection. When a
                    customer emails support asking why their total changed on Tuesday, the answer is a
                    query against the log instead of a half-day spent correlating logs and database
                    snapshots. The price of event sourcing is still real. It now buys something you
                    actually want.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Workflow Engines Belong in More Places</h2>
                  <p className="mb-4">
                    Durable workflow engines like Temporal, Restate, DBOS, and Inngest used to be a niche
                    choice for teams with a specific long-running-process problem. They should now be a
                    default for any multi-step business logic that involves an AI call, because the shape
                    of AI-involving work is exactly what these engines were built for.
                  </p>
                  <p className="mb-4">
                    LLM calls fail and time out and need retries with modified prompts. Tool calls against
                    external systems are non-idempotent and partial. A human might need to approve a step
                    in the middle of a run. That is not something you fit into a request handler with a
                    30-second timeout. It is something you build as a workflow with durable state,
                    per-activity retry policies, and signals.
                  </p>
                  <p className="mb-4">
                    The refund-with-human-approval example is on Temporal&apos;s marketing page, so let me
                    use a different one. A data ingestion pipeline where an AI proposes a schema mapping
                    from a new vendor&apos;s CSV, a deterministic validator checks it against historical
                    samples, rejections get re-prompted with the validator&apos;s actual complaint, and a
                    human is paged only after five failed attempts. As a request path this is unbuildable.
                    As a workflow, each retry is a replay with a new prompt, and six months later you can
                    open any run and see exactly what the AI tried and which attempt the validator
                    accepted.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Rust Makes More Sense, For Specific Reasons</h2>
                  <p className="mb-4">
                    The old argument against Rust was that it slowed humans down. Borrow checker,
                    lifetimes, exhaustive <code>Result</code> handling, three times the code of the
                    equivalent Python. That cost was real when a human typed every character. It is a lot
                    smaller when an AI does.
                  </p>
                  <p className="mb-4">
                    The payoff went up, but only for certain kinds of AI mistakes. A strict compiler
                    catches missing enum arms, shape mismatches, and all the &quot;forgot to update the
                    other three call sites&quot; bugs that AI-generated patches love to introduce. It does
                    not catch the most common hallucination, which is calling a real function that means
                    something different from what the AI assumed. No type system saves you from that. You
                    still need tests.
                  </p>
                  <p className="mb-4">
                    Example. In a Python codebase, ask the AI to add a new <code>payment_method</code>, and
                    it will plausibly forget one of the four places the value is switched on. In Rust with
                    an <code>enum PaymentMethod</code> and an exhaustive <code>match</code>, the missing
                    arm is a compile error the AI fixes on the next turn without you having to find it.
                    The verbosity is the feature.
                  </p>
                  <p className="mb-4">
                    Quick clarification so this section does not contradict itself: &quot;strict&quot;
                    does not mean &quot;no metaprogramming.&quot; Rust has some of the heaviest
                    metaprogramming in mainstream use, and Serde&apos;s <code>derive</code> macros are
                    fine. The distinction is whether the metaprogramming produces typed output the
                    compiler checks, or runtime reflection that makes behavior appear from nowhere. The
                    first kind helps AI-written code. The second kind does not.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Trace Everything, And Don&apos;t Confuse It With LLM Observability</h2>
                  <p className="mb-4">
                    Logging won because <code>printf</code> was cheap and setting up OpenTelemetry was
                    not. That economic argument is gone. You can get an AI to instrument a service with
                    spans, attributes, and baggage propagation in an afternoon. There is almost no reason
                    to ship a backend you cannot trace end-to-end.
                  </p>
                  <p className="mb-4">
                    But tracing answers &quot;what happened,&quot; not &quot;why the model chose
                    this.&quot; These are two different questions with two different tools. OpenTelemetry
                    shows you the request path, the tool calls, the retries, the event writes. For the
                    model&apos;s actual decision-making you want prompt and response capture, token-level
                    attribution, eval harnesses, and a tool like Langfuse, Braintrust, or Phoenix hooked
                    into the same trace IDs. Teams that treat OTel as sufficient end up with beautiful
                    traces and no idea why the bot did what it did.
                  </p>
                  <p className="mb-4">
                    Example. A customer says &quot;your bot refunded the wrong order.&quot; The OTel trace
                    shows you the request, the tool calls, the workflow signals, and the
                    <code>{' RefundIssued'}</code> event with its <code>reason</code> field. Langfuse
                    shows you the exact prompt, the retrieved context, the model version, and the
                    alternative completions the model scored lower. You need both. Either one on its own
                    leaves you guessing in the post-mortem.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Heavy Rewrites Deserve a Second Look</h2>
                  <p className="mb-4">
                    A lot of modern engineering wisdom is really risk management around the cost of
                    human rewrites. Don&apos;t rewrite it. Don&apos;t change languages. Don&apos;t migrate
                    the persistence model. These were correct when the rewrite was six engineers for nine
                    months. They are less universally correct now.
                  </p>
                  <p className="mb-4">
                    I do not want to oversell this. AI does not turn a quarter-long migration into a
                    sprint. It turns the mechanical parts of one (translation, boilerplate, test
                    scaffolding) into something that feels more like review than authoring. The data
                    backfill, the cutover plan, and the production surprises still cost what they cost.
                    What shifts is the ratio, not the total.
                  </p>
                  <p className="mb-4">
                    What that ratio shift unlocks is a different kind of project: one where the payoff
                    is high but the mechanical labor was the thing killing it. Porting a hot-path service
                    from Python to Rust. Adding event sourcing to a module that has been mysteriously
                    losing state. Retrofitting a tangled request path into a workflow engine. Adding
                    tracing across an entire fleet. These used to get planned, scoped, and then quietly
                    deferred. Now they are worth re-costing from scratch, because the line between
                    &quot;too expensive&quot; and &quot;worth doing&quot; has moved.
                  </p>
                </section>

                <section className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                  <h2 className="text-3xl font-semibold text-blue-700 dark:text-blue-300 mb-6">Closing Thought</h2>
                  <p className="mb-4">
                    If there is a common thread here, it is that cheap ceremony is good ceremony as long
                    as a machine is the one enforcing it. A compiler that rejects an invalid state. A
                    workflow engine that refuses to lose a step. An event log that records every change.
                    These used to be expensive to build. Now they are cheap, and they happen to catch
                    exactly the ways AI-authored code tends to go wrong.
                  </p>
                  <p className="mb-4">
                    The patterns that should fade are the ones where a human was the enforcement
                    mechanism: code review as the only quality gate, discipline as the only way to keep
                    duplicates in sync, convention as the only way to keep layers separate. Those were
                    always fragile. They get worse when the volume of change goes up and the reviewer
                    does not.
                  </p>
                  <p className="mb-4">
                    None of this applies universally. Embedded code, games, and throwaway scripts have
                    their own economics, and some of the advice here will be wrong for them. For the
                    long-lived backends I actually work on, where correctness and auditability matter and
                    an AI is increasingly one of the authors, the heavyweight patterns I used to skip are
                    the ones I now reach for first.
                  </p>
                </section>
              </main>
            </div>
          </div>
        </div>
      </div>
  );
}

export default Home
