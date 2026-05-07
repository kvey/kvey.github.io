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
              2024-08-27 · Essay
            </p>
            <h1 className="font-serif text-5xl sm:text-7xl leading-[0.95] tracking-tight text-ink">
              What is an<br />AI Agent?
            </h1>
            <p className="font-serif text-2xl sm:text-3xl leading-snug mt-10 text-ink max-w-xl">
              Unraveling the hype and reclaiming the concept.
            </p>
          </header>

          <article className="prose-editorial font-mono">
            <p>
              In the rapidly evolving landscape of artificial intelligence, few terms have become as ubiquitous — and as misunderstood — as &ldquo;AI agents.&rdquo; This piece unpacks the complexity behind the concept, explores how it has been oversimplified for marketing, and charts a path back to what it actually means.
            </p>

            <h2>The ambiguity of AI agents</h2>

            <h3>Defining agents: capacity for failure and initiative</h3>
            <p>
              At its core, an AI agent is defined by its capacity for failure and misinterpretation. Like humans, true agents are designed to address ambiguity, take initiative, and attempt tasks with the potential for failure. This characteristic sets them apart from systems that operate within strictly constrained parameters.
            </p>
            <p>
              The ability to fail might seem counterintuitive as a defining feature, but it is crucial for understanding the nature of agency. An agent must be able to:
            </p>
            <ol>
              <li>Interpret ambiguous instructions or situations.</li>
              <li>Make decisions based on incomplete information.</li>
              <li>Take initiative without explicit step-by-step guidance.</li>
              <li>Learn from mistakes and adjust its approach.</li>
            </ol>
            <p>
              These capabilities inherently involve the risk of failure, much like human decision-making and learning.
            </p>

            <h3>Distinguishing agents from other AI systems</h3>
            <p>
              To understand what constitutes an agent, contrast them with other AI systems.
            </p>
            <h4>Creative tools</h4>
            <p>
              Systems that generate content with low risk are more accurately described as creative tools — text, image, and music generators. They produce impressive output but lack the decision-making and potential for failure that define agents.
            </p>
            <h4>Classifiers</h4>
            <p>
              Systems that make optimistic categorization choices: image recognition, spam filters, sentiment analysis. They excel at sorting inputs against predefined criteria but don&apos;t exhibit initiative or adaptability.
            </p>
            <h4>Software with LLM integration</h4>
            <p>
              Systems operating in highly reliable environments with an LLM bolted on for natural-language input. They appear more intelligent because of the chat surface, but the underlying behavior is traditional software.
            </p>

            <h2>The dumbing-down of AI agents</h2>
            <p>
              In recent years, the concept of AI agents has been transformed for investors, enterprises, and the public. What was once a complex idea in AI research has been simplified and repackaged as a buzzword, lowering the bar for what qualifies and making it easy to slap on a pitch deck.
            </p>

            <h3>The simplification process</h3>
            <ol>
              <li><strong>Broadening the definition.</strong> &ldquo;Agent&rdquo; now covers a wide range of AI tools, many lacking the core characteristics of agency.</li>
              <li><strong>Emphasizing autonomy.</strong> Marketers focus on any level of autonomous operation, however constrained, to qualify a system as an agent.</li>
              <li><strong>Overemphasizing natural-language interfaces.</strong> Conversational ability gets branded as agency regardless of underlying capability.</li>
              <li><strong>Conflating task completion with agency.</strong> Completing a predefined task is presented as evidence of agency, ignoring initiative and decision-making in ambiguous conditions.</li>
            </ol>

            <h3>Appeal to investors and enterprises</h3>
            <p>
              The simplified concept is appealing for several reasons:
            </p>
            <ol>
              <li><strong>Easily demonstrable.</strong> Simplified &ldquo;agents&rdquo; showcase apparent intelligence through scripted interactions.</li>
              <li><strong>Lower development costs.</strong> Relaxed requirements mean marketable agent products ship faster and cheaper.</li>
              <li><strong>Alignment with existing workflows.</strong> They drop into existing business processes, easier to sell to enterprises.</li>
              <li><strong>Futuristic appeal.</strong> The label carries cutting-edge connotations even when applied to relatively simple systems.</li>
            </ol>

            <h2>The divide between agents and AGI</h2>
            <p>
              While agents represent a real step forward in AI, they are still distinct from artificial general intelligence. Key differences:
            </p>
            <ol>
              <li><strong>Generalization across tasks.</strong> AGI could perform any intellectual task a human can; agents are typically specialized.</li>
              <li><strong>Novel insights across domains.</strong> AGI would draw connections across vastly different fields; agents stay within their domain.</li>
              <li><strong>A fully internal world model.</strong> AGI would possess a comprehensive world model, allowing reasoning about abstraction. Agents have specialized, limited models.</li>
            </ol>

            <h2>Bridging the gap</h2>

            <h3>External world models and simulation</h3>
            <p>
              More sophisticated external world models and simulation could enhance an agent&apos;s ability to reason about complex scenarios and generalize across domains:
            </p>
            <ul>
              <li>Detailed virtual environments for training and testing.</li>
              <li>More accurate physics simulations.</li>
              <li>Multi-modal data feeding richer world representations.</li>
            </ul>

            <h3>Surfacing connections to human observers</h3>
            <p>
              Making an agent&apos;s reasoning more transparent could lead to breakthroughs:
            </p>
            <ul>
              <li>Better explainable-AI techniques.</li>
              <li>Intuitive visualizations of decision-making.</li>
              <li>Collaborative interfaces that let humans and AI work together more effectively.</li>
            </ul>

            <h2>Reclaiming the concept</h2>
            <p>
              To address the issues from oversimplification, the AI community — researchers, developers, ethical AI advocates — should:
            </p>
            <ol>
              <li>Promote a more nuanced understanding of what constitutes a true AI agent.</li>
              <li>Encourage transparent marketing that accurately represents capabilities.</li>
              <li>Develop standardized benchmarks for agent-like behavior.</li>
              <li>Foster dialogue between academia, industry, and the public to align expectations with reality.</li>
            </ol>

            <p>
              By focusing on the capacity for failure, initiative, and decision-making in ambiguous situations, we can distinguish true agents from other AI systems and from marketing hype. Simplification has driven investment and adoption, but it has also led to misaligned expectations. Reclaiming a more accurate understanding helps us chart the path forward.
            </p>
          </article>

        </div>
      </main>
    </>
  );
};

export default Page;
