import { ArrowUpRight } from 'lucide-react';

export function OurVisionLink({ newTab = false }: { newTab?: boolean }) {
  return (
    <a
      href="/our-vision"
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 font-display text-sm font-bold text-stone-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:text-base"
    >
      Our Vision
      {newTab ? <><ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> (opens in a new tab)</span></> : null}
    </a>
  );
}
