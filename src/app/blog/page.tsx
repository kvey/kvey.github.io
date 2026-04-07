import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import Nav from '@/components/nav';

const posts = [
  {
    date: '2024-07-09',
    title: 'Opinions',
    description: 'Strong opinions weakly held.',
  },
];

export default function BlogPage() {
  return (
    <div>
      <div className='flex flex-col pb-24'>
        <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div className={"pb-40"}>
            <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-neutral-700 p-6 mb-4">
              <h1 className='text-4xl'> COLTON PIERSON </h1>
              <p className='text-xl pt-2'>
                Founder @ THOUSAND BIRDS INC
              </p>
              <LineBreakDouble/>
              <Nav />
            </div>
            <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-neutral-700 p-6 mb-4">
              <h2 className={"text-2xl"}>Articles</h2>
              <LineBreak/>
              <table className="w-full my-2 lg:table block">
              <thead className="lg:table-header-group hidden">
              <tr>
                <th className="border py-2 px-2 text-left w-[1%] whitespace-nowrap">Date</th>
                <th className="border py-2 px-2 text-left w-[1%] whitespace-nowrap">Title</th>
                <th className="border py-2 px-2 text-left">Description</th>
              </tr>
              </thead>
              <tbody className="lg:table-row-group block">
              {posts.map((post) => (
                <tr key={post.date} className="lg:table-row flex flex-col mb-4 border">
                  <td className="lg:table-cell block border px-2 py-1">
                    <span className="font-bold lg:hidden mr-2">Date:</span>
                    <a href={`/blog/${post.date}`} className="underline text-blue-600 dark:text-blue-400">{post.date}</a>
                  </td>
                  <td className="lg:table-cell block border px-2 py-1">
                    <span className="font-bold lg:hidden mr-2">Title:</span>
                    {post.title}
                  </td>
                  <td className="lg:table-cell block border px-2 py-1">
                    <span className="font-bold lg:hidden mr-2">Description:</span>
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
