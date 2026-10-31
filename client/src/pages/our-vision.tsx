import ReactMarkdown from 'react-markdown';
import { PublicHeader } from '@/components/public-header';
import essay from '@/content/our-vision.md?raw';

export function OurVision() {
  return (
    <div className="min-h-screen bg-ikigai-beige text-stone-900">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-16">
        <a href="/" className="mb-10 inline-flex min-h-11 items-center font-display text-sm font-bold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          Return to Nami
        </a>
        <article className="prose prose-lg max-w-none text-stone-700 dark:prose-invert prose-headings:font-display prose-headings:font-black prose-h1:text-3xl prose-h1:tracking-tight prose-p:leading-8 sm:prose-h1:text-5xl">
          <ReactMarkdown skipHtml>{essay}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
