import { RefereeError } from './rules.js';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  return slug === '' ? 'debate' : slug;
}

export function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function assertValidId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new RefereeError(`Invalid debate id "${id}".`);
}

export async function uniqueId(
  base: string,
  taken: (id: string) => Promise<boolean>,
): Promise<string> {
  let id = base;
  for (let n = 2; await taken(id); n += 1) id = `${base}-${n}`;
  return id;
}
