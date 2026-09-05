import type { PurposePath } from '@shared/career-map';

const pathStyles = [
  { header: 'bg-[#4db6ac]', project: 'bg-[#dff3f1]' },
  { header: 'bg-[#ffc107]', project: 'bg-[#fff4cc]' },
  { header: 'bg-[#ff6b35]', project: 'bg-[#ffe1d6]' },
] as const;

const buttonClass = 'min-h-11 border-2 border-black bg-white px-3 py-2 font-display text-xs font-black shadow-[2px_2px_0_rgba(0,0,0,0.65)] transition-[transform,box-shadow] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:cursor-wait disabled:opacity-50';

export function humanizeStatus(status: string): string {
  return status.replaceAll('-', ' ').replace(/^./u, (first) => first.toUpperCase());
}

function SelectionLabel({ selection }: { selection: PurposePath['selection'] }) {
  return (
    <span className="inline-block border border-black bg-white px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-black">
      {humanizeStatus(selection)}
    </span>
  );
}

export function PurposePathCard({
  path,
  index,
  onStart,
  startDisabled = false,
}: {
  path: PurposePath;
  index: number;
  onStart?: () => void;
  startDisabled?: boolean;
}) {
  const style = pathStyles[index] ?? pathStyles[0];
  return (
    <article
      data-testid="purpose-path-card"
      className="method-path-card border-2 border-black bg-white shadow-[6px_6px_0_rgba(0,0,0,0.65)]"
    >
      <header data-path-band="identity" className={`border-b-2 border-black p-5 ${style.header}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-block bg-black px-2 py-1 font-display text-xs font-black uppercase tracking-[0.1em] text-white">
            Path {String(index + 1).padStart(2, '0')}
          </span>
          <SelectionLabel selection={path.selection} />
        </div>
        <h3 className="mt-3 text-xl font-black leading-tight">{path.name}</h3>
        <p className="mt-2 text-sm font-semibold leading-6">{path.servesWhy}</p>
      </header>
      <section data-path-band="possibility" className="method-path-band">
        <h4 className="method-map-label">What could become possible</h4>
        <p className="text-sm leading-6">{path.possibility}</p>
      </section>
      <section data-path-band="evidence" className="method-path-band">
        <h4 className="method-map-label">Evidence it may fit</h4>
        <p className="text-sm leading-6">{path.evidence.join(' · ')}</p>
      </section>
      <section data-path-band="unknown" className="method-path-band border-y-2 !border-black bg-ikigai-cream">
        <h4 className="method-map-label !text-black">The central unknown</h4>
        <p className="font-display text-lg font-extrabold leading-6">{path.centralUnknown}</p>
      </section>
      <section data-path-band="project" className={`method-path-band border-y-2 !border-black ${style.project}`}>
        <h4 className="method-map-label !text-black">First project</h4>
        <p className="text-sm leading-6">{path.projectPreview}</p>
      </section>
      <section data-path-band="practical-fit" className="method-path-band">
        <h4 className="method-map-label">How it could fit your life</h4>
        <p className="text-sm leading-6">{path.practicalFit}</p>
      </section>
      <footer data-path-band="action" className="method-path-band flex flex-wrap items-end gap-2">
        {onStart ? (
          <button
            type="button"
            disabled={startDisabled}
            className={`${buttonClass} ${style.header}`}
            aria-label={`Start path ${index + 1}: ${path.name}`}
            onClick={onStart}
          >
            Start this path
          </button>
        ) : null}
      </footer>
    </article>
  );
}
