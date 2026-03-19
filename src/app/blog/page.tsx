import { LineBreak, LineBreakDouble } from '@/components/linebreak';
import Nav from '@/components/nav';

const posts = [
  {
    date: '2024-08-27',
    title: 'What is an AI Agent',
    description: 'Attempting to clarify the overloaded buzzword.',
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
      <div className='flex flex-col pb-24'>
        <div className='mx-4 mb-0 md:px-4 px-8 md:pt-8 pt-8 pb-2 mt-8 max-w-4xl flex flex-col md:gap-x-26 gap-8 w-full'>
          <div className={"pb-40"}>
            <h1 className='text-4xl'> COLTON PIERSON </h1>
            <p className='text-xl pt-2'>
              Founder @ THOUSAND BIRDS INC
            </p>
            <LineBreakDouble/>
            <Nav />
            <h2 className={"text-2xl mt-12"}>Articles</h2>
            <LineBreak/>
            <table className="w-full my-2 lg:table block bg-white">
              <thead className="lg:table-header-group hidden">
              <tr>
                <th className="border py-2 px-2 text-left">Date</th>
                <th className="border py-2 px-2 text-left">Title</th>
                <th className="border py-2 px-2 text-left">Description</th>
              </tr>
              </thead>
              <tbody className="lg:table-row-group block">
              {posts.map((post) => (
                <tr key={post.date} className="lg:table-row flex flex-col mb-4 border">
                  <td className="lg:table-cell block border px-2 py-1">
                    <span className="font-bold lg:hidden mr-2">Date:</span>
                    <a href={`/blog/${post.date}`} className="underline text-blue-600">{post.date}</a>
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
  );
}
