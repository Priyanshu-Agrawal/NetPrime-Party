/**
 * One task at a time, in order. A queued task whose caller has gone by its turn is skipped (resolves undefined), so
 * browsing past several title pages runs one page's plugins, not every page's at once.
 */
export function oneAtATime() {
  let last: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>, alive: () => boolean = () => true): Promise<T | undefined> {
    const next = last.then(() => (alive() ? task() : undefined));
    last = next.catch(() => undefined);
    return next;
  };
}
