/**
 * True when `err` is a Prisma "known request" error (optionally with a given code, e.g. P2002).
 *
 * Duck-typed on purpose: in desktop mode the SQLite client is generated separately, so its
 * error classes are not the ones exported by `@prisma/client` and `instanceof` would miss them.
 */
export function isPrismaError(
  err: unknown,
  code?: string,
): err is Error & { code: string } {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; code?: unknown };
  return (
    e.name === 'PrismaClientKnownRequestError' &&
    typeof e.code === 'string' &&
    (code === undefined || e.code === code)
  );
}
