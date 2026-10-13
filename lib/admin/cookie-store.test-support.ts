// A stand-in for next/headers' cookies() store: what the request sent, and every write the code
// under test makes, in order; the jar holds what a browser would keep afterwards. `readOnly` behaves as a Server Component's store does, where a
// write throws.

export interface CookieWrite {
  readonly op: 'set' | 'delete';
  readonly name: string;
  readonly value?: string;
  readonly options?: Record<string, unknown>;
}

export class FakeCookieStore {
  readonly writes: CookieWrite[] = [];
  private readonly jar = new Map<string, string>();

  constructor(
    sent: Record<string, string> = {},
    private readonly readOnly = false,
  ) {
    for (const [name, value] of Object.entries(sent)) this.jar.set(name, value);
  }

  getAll() {
    return [...this.jar].map(([name, value]) => ({ name, value }));
  }

  get(name: string) {
    const value = this.jar.get(name);
    return value === undefined ? undefined : { name, value };
  }

  has(name: string) {
    return this.jar.has(name);
  }

  set(name: string, value: string, options?: Record<string, unknown>) {
    if (this.readOnly)
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    // A cookie set to expire at once is gone, as the browser treats it.
    if (options?.maxAge === 0) this.jar.delete(name);
    else this.jar.set(name, value);
    this.writes.push({ op: 'set', name, value, options });
    return this;
  }

  delete(options: { name: string; path?: string }) {
    if (this.readOnly)
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    this.jar.delete(options.name);
    this.writes.push({ op: 'delete', name: options.name, options: { path: options.path } });
    return this;
  }
}
