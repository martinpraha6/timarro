import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './url';

describe('safeHttpUrl', () => {
  it('keeps http(s) URLs, absolute and relative alike', () => {
    expect(safeHttpUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeHttpUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
    // Relative paths resolve against the host page, which is where an author
    // writing "/covers/a.png" into their own timeline JSON meant them to go.
    expect(safeHttpUrl('/covers/a.png')).toBe(new URL('/covers/a.png', document.baseURI).href);
  });

  it('drops every other scheme', () => {
    for (const hostile of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:image/svg+xml,<svg onload="alert(1)"/>',
      'file:///etc/passwd',
      '',
    ]) {
      expect(safeHttpUrl(hostile)).toBeNull();
    }
  });
});
