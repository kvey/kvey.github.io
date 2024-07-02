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
      <div className='flex flex-col mx-4'>
        <div
             className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div>
            <h1 className='text-4xl'> COLTON PIERSON </h1>
            <p className='text-xl pt-2'>
              Founder @ THOUSAND BIRDS INC
            </p>
            <p className='text pt-4'>
              Building infrastructure for AI Agents.
            </p>
            {/*<h1 className='text-2xl'>ABOUT</h1>*/}
            {/*<LineBreakDouble />*/}
            <h2 className={"text-2xl mt-12"}>Background</h2>
            <LineBreak/>
            <table className={"my-2"}>
              <thead className={"text-left"}>
                <tr className={""}>
                  <th className={"border py-2 px-2"}>Workplace</th>
                  <th className={"border py-2 px-2"}>Role</th>
                </tr>
              </thead>
              <tbody>
              <tr>
                <td className={"border px-2 whitespace-nowrap pr-4 w-60"}><a href={"https://thousandbirds.ai"}
                                                                             className={"underline text-blue-600"}>Thousand
                  Birds</a></td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>Founder</td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>
                  Infrastructure for AI agents. Backed by HF0.
                </td>
              </tr>
              <tr>
                <td className={"border px-2 whitespace-nowrap pr-4 w-60"}><a href={"https://curative.com"}
                                                                             className={"underline text-blue-600"}>Curative</a>
                </td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>VP of Engineering</td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>
                  36m+ COVID-19 tests and 600k+ vaccinations. {">"}$1b revenue and 7000 employees in first year.
                </td>
              </tr>
              <tr>
                <td className={"border px-2 whitespace-nowrap pr-4 w-60"}><a href={"https://figma.com"} className={"underline text-blue-600"}>Figma</a></td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>Software Engineer</td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>
                  Infrastructure and editor performance.
                </td>
              </tr>
              <tr>
                <td className={"border px-2 whitespace-nowrap pr-4 w-60"}><a href={"https://asm.co"} className={"underline text-blue-600"}>Assembly (YCS15)</a></td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>CTO, Co-Founder</td>
                <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>
                  Backed by YC in 2015. QC platform for manufacturing.
                </td>
              </tr>
              </tbody>
            </table>
            {/*<h2 className={"text-2xl mt-12"}>Writing</h2>*/}
            {/*<LineBreak/>*/}
            {/*<table className={"my-2"}>*/}
            {/*  <thead className={"text-left"}>*/}
            {/*  <tr className={""}>*/}
            {/*    <th className={"border py-2 px-2"}>Date</th>*/}
            {/*    <th className={"border py-2 px-2"}>Title</th>*/}
            {/*    <th className={"border py-2 px-2"}>Description</th>*/}
            {/*  </tr>*/}
            {/*  </thead>*/}
            {/*  <tbody>*/}
            {/*  <tr>*/}
            {/*    <td className={"border px-2 whitespace-nowrap pr-4 w-60"}>*/}
            {/*      <a href={"https://thousandbirds.ai"} className={"underline text-blue-600"}>2023-09-10</a></td>*/}
            {/*    <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>*/}
            {/*      Title</td>*/}
            {/*    <td className={"border px-2 whitespace-nowrap overflow-ellipsis overflow-hidden max-w-lg"}>*/}
            {/*      Desc</td>*/}
            {/*  </tr>*/}
            {/*  </tbody>*/}
            {/*</table>*/}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home

