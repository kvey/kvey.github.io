import Head from 'next/head'
import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import { Logo } from '@/components/logo';


const Home = () => {
  return (
    <div>
      <div className='flex flex-col text-black mx-4'>
        <div style={{ background: '#FFF' }}
             className='mx-4 mb-4 md:px-4 px-8 md:pt-24 pt-12 pb-4 max-w-4xl flex flex-col md:gap-16 gap-8 w-full'>
          <div>
            <h1 className='text-5xl'> BLOG </h1>
            <p className='text-2xl pt-2'>
              Infrastructure for AI Agents.
            </p>
            <p className='text pt-6'>
              Explore the future of software development; build reliable, durable, and scalable agent systems.
            </p>
          </div>
        </div>
        <div style={{ background: '#FFF' }}
             className='mx-4 mb-16 md:px-4 px-8 md:pt-24 pt-4 pb-24 max-w-4xl flex flex-col md:gap-16 gap-8 w-full'>
          <div className="flex flex-row w-full md:visible hidden">
            <div className="flex flex-1">
              SEPT 2023
            </div>
            <div className="flex self-end text-right">
              [-]
            </div>
          </div>
          <div>
            <h1 className='text-3xl'>WHAT IS AN AGENT</h1>
            <LineBreakDouble />
            <p className='text pt-4'>
              Agents are a new form of applications. Thousand Birds is an ecosystem for building, deploying, and
              managing
              agentic software systems.
            </p>
            <p className='hidden md:flex text pt-4 whitespace-pre' style={{ lineHeight: '17px' }}>
              {'┌────────┐          ┌────────────────┐         ┌──────────────────────┐\r\n'}
              {'|  LLMs  | ◀──────▶ │  Orchestrator  │ ◀─────▶ │ External Environment │\r\n'}
              {'└────────┘          └────────────────┘         └──────────────────────┘\r\n'}
            </p>
            <p className='text pt-4'>
              Large Language Models (LLMs) have provided new capabilities for
              natural language processing and generative workflows. In many cases code can be authored
              by prompting of language models.
            </p>
          </div>
          <div>
            <LineBreak />
            <p className='text-xl pt-2 whitespace-pre-wrap'>
              The Challenges of Agents
            </p>
            <p className='text pt-4'>
              Building agents is hard. They are complex systems that require the integration of many
              different technologies. LLMs are expensive and require fine-tuning or prompt engineering to achieve
              desired results. Behavior can be difficult to debug and understand.
              Agents are difficult to audit and verify.
            </p>
            <p className='text pt-4 whitespace-pre-wrap'>
              Our goal is to address as many of these challenges for you as we can:
            </p>
            <ul className='list-outside list-disc pl-6 pt-4'>
              <li>How are we going to understand the system of our agent during development?</li>
              <li>Evaluating LLMs during testing and development can add up, how do we manage inference costs?</li>
              <li>Debugging agents can mean digging through thousands of lines of natural language log output, how are
                we going to make that less arduous?
              </li>
              <li>Once we get the agent deployed, how will we monitor and management it?</li>
              <li>And more...</li>
            </ul>
          </div>
        </div>
        <div style={{ background: '#FFF' }}
             className='mx-4 mb-16 md:px-4 px-8 md:pt-24 pt-4 pb-24 max-w-4xl flex flex-col md:gap-16 gap-8 w-full'>
          <div className="flex flex-row w-full md:visible hidden">
            <div id='features' className='relative' style={{ top: '-168px', height: "0px", margin: "0px", padding: "0px" }}></div>
            <div className="flex flex-1">
              SEPT 2023
            </div>
            <div className="flex self-end text-right">
              [-]
            </div>
          </div>
          {/*<div>*/}
          {/*  <h1 className='text-3xl'>FEATURES</h1>*/}
          {/*  <LineBreakDouble />*/}
          {/*  <p className='text-xl pt-2 whitespace-pre-wrap'>*/}
          {/*    Visualize and understand your agents.*/}
          {/*  </p>*/}
          {/*  <p className='text pt-4'>*/}
          {/*    Thousand Birds provides an SDK for defining agents that gives clean abstractions for defining agent*/}
          {/*    behavior. The SDK is designed to be integrated with our visualization engine that provides a graphical*/}
          {/*    representation of your {"agent's"} definition and behavior.*/}
          {/*  </p>*/}
          {/*</div>*/}
          <div>
            <h1 className='text-3xl'>FEATURES</h1>
            <LineBreakDouble />
            <p className='text-xl pt-2 whitespace-pre-wrap'>
              Debug your agents with time travel.
            </p>
            <p className='text pt-2 whitespace-pre-wrap'>
              Time travel debugging allows you to pause, rewind, and inspect previous executions of your agents. Going
              beyond observability, Thousand Birds supports modification of both the definition or state of your agent
              in prior runs, enabling iterative development within long running executions.
            </p>
          </div>
          <div>
            <LineBreak />
            <p className='text-xl pt-2 whitespace-pre-wrap'>
              Audit the execution history of your agents.
            </p>
            <p className='text pt-2 whitespace-pre-wrap'>
              Our framework is built around a reactive database as a central component. This database is designed to
              capture the execution history of your agents.
              This provides a rich audit trail of your {"agent's"} behavior, and allows you to query and inspect the
              execution history of your agents.
            </p>
          </div>
          <div>
            <LineBreak />
            <p className='text-xl pt-2 whitespace-pre-wrap'>
              Understand how often {"you're"} getting specific behavior.
            </p>
            <p className='text pt-2 whitespace-pre-wrap'>
              Thousand Birds provides a rich set of tools for building evaluation metrics for your agents. These metrics
              can be used to monitor the behavior of your agents in production, or to evaluate the performance of your
              agents during development.
            </p>
            <p className='text pt-2 whitespace-pre-wrap'>
              Combined with our structural definition features we provide a powerful toolset for understanding the
              probability distribution of your {"agent's"} behavior.
            </p>
          </div>
        </div>

      </div>


    </div>
  );
}

export default Home

