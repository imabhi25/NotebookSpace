import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The CSP allows the inline theme script by hash; this fails if that script changes without the hash being updated.
describe('security headers', () => {
  const html = readFileSync('index.html', 'utf8');
  const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
  const hash = `sha256-${createHash('sha256').update(inline).digest('base64')}`;
  for (const file of ['vercel.json', 'public/_headers']) {
    it(`${file} carries the CSP with the current inline-script hash`, () => {
      const text = readFileSync(file, 'utf8');
      expect(text).toContain(hash);
      expect(text).toContain("frame-ancestors 'none'");
      // Production talks only to this origin; no scheme-wide https: or localhost allowances.
      expect(text).toContain("connect-src 'self' https://notebookspace-api.onrender.com;");
      expect(text).not.toMatch(/connect-src[^;]*(\shttps:(\s|;)|localhost|127\.0\.0\.1)/);
      expect(text).toContain('nosniff');
    });
  }
});
