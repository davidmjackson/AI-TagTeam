import { describe, expect, it } from 'vitest';
import { assertValidId, dayStamp, slugify, uniqueId } from '../src/ids.js';
import { RefereeError } from '../src/rules.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Move Auth to Middleware?')).toBe('move-auth-to-middleware');
  });

  it('falls back when nothing usable remains', () => {
    expect(slugify('?!… ')).toBe('debate');
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'word '.repeat(30)}end`);
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('dayStamp', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dayStamp(new Date('2026-10-16T23:59:00Z'))).toBe('2026-10-16');
  });
});

describe('assertValidId', () => {
  it('accepts generated ids', () => {
    expect(() => assertValidId('2026-10-16-move-auth-2')).not.toThrow();
  });

  it.each(['../etc/passwd', 'a/b', 'UPPER', '', 'a b', 'a.json'])('rejects %j', (id) => {
    expect(() => assertValidId(id)).toThrow(RefereeError);
  });
});

describe('uniqueId', () => {
  it('suffixes until free', async () => {
    const taken = new Set(['base', 'base-2']);
    expect(await uniqueId('base', async (id) => taken.has(id))).toBe('base-3');
  });
});
