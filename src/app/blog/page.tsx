import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import Nav from '@/components/nav';

const posts = [
  {
    date: '2026-04-13',
    title: 'Design Patterns in the Age of AI',

    description: 'Which engineering patterns should change now that AI can read, write, and refactor code for us.',
  },
  {
    date: '2024-07-09',
    title: 'Opinions',
    description: 'Strong opinions weakly held.',
  },
];

export default function BlogPage() {
  return (
    <div>
      <div className='flex flex-col items-center pb-24'>
        <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div className={"pb-40"}>
            <div className="bg-white/80 dark:bg-black/80 border border-gray-200 dark:border-neutral-700 px-8 py-10 mb-4">
              <h1 className='text-4xl'> COLTON PIERSON </h1>
              <p className='text-xl pt-2'>
                Founder @ THOUSAND BIRDS INC
              </p>
              <LineBreakDouble/>
              <Nav />
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
              {posts.map((post, i) => (
                <tr key={post.date} className={`lg:table-row flex flex-col mb-4 lg:mb-0 ${i < posts.length - 1 ? 'border-b border-gray-200 dark:border-neutral-700' : ''}`}>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Date</span>
                    <a href={`/blog/${post.date}`} className="underline text-blue-600 dark:text-blue-400">{post.date}</a>
                  </td>
                  <td className="lg:table-cell whitespace-nowrap align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Title</span>
                    {post.title}
                  </td>
                  <td className="lg:table-cell align-top block px-4 py-3">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:hidden block mb-1">Description</span>
                    {post.description}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
