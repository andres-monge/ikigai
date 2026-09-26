import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const verbs = [
  'Thinking', 'Pondering', 'Mulling', 'Noodling', 'Percolating', 'Spelunking',
  'Marinating', 'Brewing', 'Synthesizing', 'Ruminating', 'Crafting', 'Tinkering',
  'Sketching', 'Connecting', 'Unraveling', 'Imagining', 'Cultivating', 'Composing',
  'Deciphering', 'Concocting', 'Germinating', 'Orbiting', 'Whirring', 'Zesting',
] as const;

function nextVerbIndex(previous: number): number {
  const index = Math.floor(Math.random() * (verbs.length - 1));
  return index >= previous ? index + 1 : index;
}

export function ActivityIndicator() {
  const [verbIndex, setVerbIndex] = useState(() => Math.floor(Math.random() * verbs.length));

  useEffect(() => {
    let timer: number;
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        setVerbIndex(nextVerbIndex);
        scheduleNext();
      }, 1500 + Math.random() * 1500);
    };
    scheduleNext();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[38rem] text-sm font-bold text-stone-600">
      <span role="status" aria-label="Revelio is responding." className="sr-only">Revelio is responding.</span>
      <span aria-hidden="true" className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
        <span>{verbs[verbIndex]}…</span>
      </span>
    </div>
  );
}
