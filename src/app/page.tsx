import Head from 'next/head'
import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import { Logo } from '@/components/logo';
import Nav from '@/components/nav';

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


const Home = () => {
  return (
      <div>
        <div className='flex flex-col items-center pb-24'>
          <div
              className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
            <div className={"pb-40"}>
              <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                <h1 className='text-4xl'> COLTON PIERSON </h1>
                <p className='text-xl pt-2'>
                  Founder @ THOUSAND BIRDS INC
                </p>
                <p className='text pt-4'>
                  Building infrastructure for AI Agents.
                </p>
                <LineBreakDouble/>
                <Nav />
              </div>
              <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                <h2 className={"text-2xl"}>Background</h2>

                <table className="w-full my-4 lg:table block border-collapse">
                <thead className="lg:table-header-group hidden">
                <tr className="border-b border-gray-300 dark:border-neutral-600">
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Workplace</th>
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Role</th>
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400">About</th>
                </tr>
                </thead>
                <tbody className="lg:table-row-group block">
                {/* Thousand Birds */}
                <tr className="lg:table-row flex flex-col mb-4 lg:mb-0 border-b border-gray-200 dark:border-neutral-700">
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Workplace</span>
                    <a href="https://thousandbirds.ai" target="_blank" className="underline text-blue-600 dark:text-blue-400">Thousand Birds</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Role</span>
                    Founder
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">About</span>
                    Infrastructure for AI agents. Backed by HF0.
                  </td>
                </tr>
                {/* Curative */}
                <tr className="lg:table-row flex flex-col mb-4 lg:mb-0 border-b border-gray-200 dark:border-neutral-700">
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Workplace</span>
                    <a href="https://curative.com" target="_blank" className="underline text-blue-600 dark:text-blue-400">Curative</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Role</span>
                    VP of Engineering
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">About</span>
                    36m+ COVID tests, {">"}$1B revenue, and 7000 employees in first year
                  </td>
                </tr>
                {/* Figma */}
                <tr className="lg:table-row flex flex-col mb-4 lg:mb-0 border-b border-gray-200 dark:border-neutral-700">
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Workplace</span>
                    <a href="https://www.figma.com/about" target="_blank" className="underline text-blue-600 dark:text-blue-400">Figma</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Role</span>
                    Software Engineer
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">About</span>
                    <a href="https://finance.yahoo.com/quote/FIG/" target="_blank" className="underline text-blue-600 dark:text-blue-400">FIG</a>, worked on collaboration and editor/viewer performance.
                  </td>
                </tr>
                {/* Assembly */}
                <tr className="lg:table-row flex flex-col mb-4 lg:mb-0">
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Workplace</span>
                    <a href="https://asm.co" target="_blank" className="underline text-blue-600 dark:text-blue-400">Assembly</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Role</span>
                    Co-Founder, CTO
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">About</span>
                    YC S2015. Quality control platform for manufacturing.
                  </td>
                </tr>
                </tbody>
              </table>
              </div>
              <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
                <h2 className={"text-2xl"}>Articles</h2>

                <table className="w-full my-4 lg:table block border-collapse">
                <thead className="lg:table-header-group hidden">
                <tr className="border-b border-gray-300 dark:border-neutral-600">
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Date</th>
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 w-[1%] whitespace-nowrap">Title</th>
                  <th className="py-3 px-4 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400">Description</th>
                </tr>
                </thead>
                <tbody className="lg:table-row-group block">
                <tr className="lg:table-row flex flex-col mb-4 lg:mb-0">
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Date</span>
                    <a href="/blog/2024-07-09" className="underline text-blue-600 dark:text-blue-400">2024-07-09</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Title</span>
                    Opinions
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Description</span>
                    Strong opinions weakly held.
                  </td>
                </tr>
                </tbody>
              </table>
              </div>
              <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
              <p>
                {"I started by co-founding "}
                <a href="https://asm.co" target="_blank" className="underline text-blue-600 dark:text-blue-400">Assembly Inc</a>
                {" through YC to rethink manufacturing quality control. At "}
                <a href="https://www.figma.com/about" target="_blank" className="underline text-blue-600 dark:text-blue-400">Figma</a>
                {", I worked on the collaboration and performance that helped it become the tool every designer reaches for. At "}
                <a href="https://curative.com" target="_blank" className="underline text-blue-600 dark:text-blue-400">Curative</a>
                {", I led engineering as we scaled to 7000 people and 36M+ COVID tests at the height of the pandemic. Now I'm building "}
                <a href="https://thousandbirds.ai" target="_blank" className="underline text-blue-600 dark:text-blue-400">Thousand Birds</a>
                {" \u2014 infrastructure for AI agents."}
                <br/>
                <br/>
                <i>{"\u201CSometimes magic is just someone spending more time on something than anyone else might reasonably expect\u201D"}</i> {" \u2014 Teller"}
              </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}

export default Home

