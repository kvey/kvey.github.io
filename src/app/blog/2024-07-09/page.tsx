import Head from 'next/head'
import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import { Logo } from '@/components/logo';


const Home = () => {
  return (
    <div>
      <div className='flex flex-col mx-4'>
        <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <a href={"/"} className={"text-blue-600 underline"}>
            {"<<< Back"}
          </a>
          <div className={"pb-40"}>
            <h1 className='text-4xl'> Opinions </h1>
            <p className='text pt-4'>
              A distillation of some accumulated opinions
            </p>
            <LineBreakDouble/>
            <h2 className={"text-2xl mt-12 mb-4"}>Engineering</h2>
            <ul className={"list-disc flex flex-col gap-2"}>
              <li className={"ml-8"}>
                I would rather use a typed language than an untyped one.
                {" I've"} used Python, JavaScript, TypeScript, Clojure, Rust, and Kotlin in production.
              </li>
              <li className={"ml-8"}>
                Lean hard on static analysis, types, and tests to thoroughly validate your code.
              </li>
            </ul>
            <h2 className={"text-2xl mt-12 mb-4"}>Leadership</h2>
            <ul className={"list-disc"}>
              <li className={"ml-8"}>
                I believe engineering is fundamentally about people. I care about how you feel, satisfaction, mental
                state and well being. Happy, focused, and driven people are the most productive, best to work with and
                they help one another do their best work.
              </li>
              <li className={"ml-8"}>
                I believe in essence and getting to the heart of things, reuse and systems thinking. I enjoy debugging,
                understanding, building mental models and getting to the root of issues. I will find joy in building
                these models with you and be excited when I see you do the same.
              </li>
              <li className={"ml-8"}>
                I believe in bias to action. Our best option is to keep learning, explore the environment, and reduce
                unknowns. Action will short circuit debate and I believe that’s the correct tradeoff. I would rather we
                do something 50% wrong but learn something than wait and do something perfectly after a significant
                delay. I believe incremental change and course correction is more effective than initial precision.
              </li>
            </ul>
            <h2 className={"text-2xl mt-12 mb-4"}>AI</h2>
            <ul className={"list-disc"}>
              <li className={"ml-8"}>
                The anthropomorphism of AI is a net-negative for humanity.
                Pundits are deliberately mis-informing the users of AI about its capabilities.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home

