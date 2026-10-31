import { Compass } from 'lucide-react';
import { OurVisionLink } from '@/components/our-vision-link';
import { ThemeToggle } from '@/components/theme-toggle';

export function PublicHeader() {
  return (
    <header className="border-b-2 border-black bg-white px-4 py-4 sm:px-8 sm:py-5">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-[112rem] items-center justify-between gap-3">
        <a href="/" aria-label="Nami home" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          <Compass aria-hidden="true" className="h-7 w-7 text-ikigai-teal sm:h-8 sm:w-8" />
          <span className="font-display text-2xl font-black tracking-tight sm:text-3xl">Nami</span>
        </a>
        <div className="flex items-center gap-3 sm:gap-8">
          <OurVisionLink />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
