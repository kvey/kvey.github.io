import Head from 'next/head'
import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import { Logo } from '@/components/logo';

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


const Home = () => {
  return (
    <div>
      <div className='flex flex-col pb-24'>
        <div
             className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div className={"pb-40"}>
            <h1 className='text-4xl'> COLTON PIERSON </h1>
            <p className='text-xl pt-2'>
              Founder @ THOUSAND BIRDS INC
            </p>
            <p className='text pt-4'>
              Building infrastructure for AI Agents.
            </p>
            <LineBreakDouble/>
            <h2 className={"text-2xl mt-12"}>Background</h2>
            <LineBreak/>
            <table className="w-full my-2 lg:table block">
              <thead className="lg:table-header-group hidden">
              <tr>
                <th className="border py-2 px-2 text-left">Workplace</th>
                <th className="border py-2 px-2 text-left">Role</th>
                <th className="border py-2 px-2 text-left">About</th>
              </tr>
              </thead>
              <tbody className="lg:table-row-group block">
              {/* Thousand Birds */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell whitespace-nowrap overflow-ellipsis   block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Workplace:</span>
                  <a href="https://thousandbirds.ai" target="_blank" className="underline text-blue-600">Thousand
                    Birds</a>
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Role:</span>
                  Founder
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">About:</span>
                  Infrastructure for AI agents. Backed by HF0.
                </td>
              </tr>
              {/* Curative */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell lg:whitespace-nowrap overflow-ellipsis block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Workplace:</span>
                  <a href="https://curative.com" target="_blank" className="underline text-blue-600">Curative</a>
                </td>
                <td className="lg:table-cell block border lg:whitespace-nowrap overflow-ellipsis  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Role:</span>
                  VP of Engineering
                </td>
                <td className="lg:table-cell block border lg:whitespace-nowrap overflow-ellipsis  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">About:</span>
                  36m+ COVID tests, {">"}$1B revenue, and 7000 employees in first year
                </td>
              </tr>
              {/* Figma */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Workplace:</span>
                  <a href="https://figma.com" target="_blank" className="underline text-blue-600">Figma</a>
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Role:</span>
                  Software Engineer
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">About:</span>
                  Valued @ $12.5B, worked on editor + viewer performance.
                </td>
              </tr>
              {/* Assembly */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Workplace:</span>
                  <a href="https://asm.co" target="_blank" className="underline text-blue-600">Assembly</a>
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Role:</span>
                  CTO, Co-Founder
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">About:</span>
                  YC S2015. QC platform for manufacturing.
                </td>
              </tr>
              </tbody>
            </table>
            <h2 className={"text-2xl mt-12"}>Articles</h2>
            <LineBreak/>
            <table className="w-full my-2 lg:table block">
              <thead className="lg:table-header-group hidden">
              <tr>
                <th className="border py-2 px-2 text-left">Date</th>
                <th className="border py-2 px-2 text-left">Title</th>
                <th className="border py-2 px-2 text-left">Description</th>
              </tr>
              </thead>
              <tbody className="lg:table-row-group block">
              {/* First row */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Date:</span>
                  <a href="/blog/2024-08-27" className="underline text-blue-600">2024-08-27</a>
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Title:</span>
                  What is an AI Agent
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Description:</span>
                  Attempting to clarify the overloaded buzzword.
                </td>
              </tr>
              {/* Second row */}
              <tr className="lg:table-row flex flex-col mb-4 border ">
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Date:</span>
                  <a href="/blog/2024-07-09" className="underline text-blue-600">2024-07-09</a>
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Title:</span>
                  Opinions
                </td>
                <td className="lg:table-cell block border  px-2 py-1">
                  <span className="font-bold lg:hidden mr-2">Description:</span>
                  Strong opinions weakly held.
                </td>
              </tr>
              </tbody>
            </table>
            <h2 className={"text-2xl mt-12"}></h2>
            <p>
              {"I've co-founded a YC-backed manufacturing startup (Assembly Inc), made critical contributions at a unicorn (Figma) as it leapt to becoming the de-facto tool for designers, and led engineering at a 7000+ employee COVID-testing organization at the peak of the pandemic (Curative)."}
              <br/>
              <br/>
              {"I am the founder of Thousand Birds Inc, where I'm building the future of developer experiences for agentic AI software systems."}
              <br/>
              <br/>
              {'My favorite quote is '}
              <i>{'"Sometimes magic is just someone spending more time on something than anyone else might reasonably expect"'}</i> {" - Teller"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home

