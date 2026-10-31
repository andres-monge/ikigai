import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
const title = 'Nami — Figure out what to work on next.';
const description = 'Explore possible paths, try small projects, and learn what actually fulfills you.';

describe('public entry metadata', () => {
  it('uses the approved message in the document and social previews', () => {
    expect(html).toContain(`<title>${title}</title>`);
    for (const name of ['description', 'twitter:description']) {
      expect(html).toContain(`<meta name="${name}" content="${description}"`);
    }
    expect(html).toContain(`<meta property="og:description" content="${description}"`);
    expect(html).toContain(`<meta property="og:title" content="${title}"`);
    expect(html).toContain(`<meta name="twitter:title" content="${title}"`);
    expect(html).not.toMatch(/8 questions|3 paths made for you/i);
  });

  it('ships the selected image at the origin-based social asset path', () => {
    expect(html).toContain('property="og:image" content="__NAMI_APP_ORIGIN__/assets/og-image.png"');
    expect(html).toContain('name="twitter:image" content="__NAMI_APP_ORIGIN__/assets/og-image.png"');
    const asset = readFileSync(new URL('../client/public/assets/og-image.png', import.meta.url));
    const selected = readFileSync(new URL('../docs/evidence/nami-public-entry/share-approved-direction.png', import.meta.url));
    expect(asset.equals(selected)).toBe(true);
  });
});
