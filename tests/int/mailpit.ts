// The local stack's mail catcher (Mailpit, `supabase start`, port 54324 in supabase/config.toml),
// read over its HTTP API so tests can see what Supabase Auth sent and to whom. Shared by the
// integration tests and the e2e sign-in spec.

export const MAILPIT_URL = 'http://127.0.0.1:54324';

export interface CaughtMessage {
  readonly id: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly created: string;
}

interface SearchAnswer {
  messages: { ID: string; To: { Address: string }[]; Subject: string; Created: string }[];
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${MAILPIT_URL}${path}`, init);
  if (!response.ok) throw new Error(`Mailpit answered ${response.status} to ${path}`);
  return response;
}

const toQuery = (address: string) => `query=${encodeURIComponent(`to:"${address}"`)}`;

/** Every message caught for the address, newest first. */
export async function messagesTo(address: string): Promise<CaughtMessage[]> {
  const answer = (await (await call(`/api/v1/search?${toQuery(address)}`)).json()) as SearchAnswer;
  return answer.messages
    .map((message) => ({
      id: message.ID,
      to: message.To.map((to) => to.Address.toLowerCase()),
      subject: message.Subject,
      created: message.Created,
    }))
    .filter((message) => message.to.includes(address.toLowerCase()));
}

export async function deleteMessagesTo(address: string): Promise<void> {
  await call(`/api/v1/search?${toQuery(address)}`, { method: 'DELETE' });
}

/** The sign-in link in a caught message: the first href to /admin/auth/confirm. */
export async function confirmLinkIn(id: string): Promise<URL> {
  const { HTML } = (await (await call(`/api/v1/message/${id}`)).json()) as { HTML: string };
  const href = /href="([^"]*\/admin\/auth\/confirm\?[^"]*)"/.exec(HTML)?.[1];
  if (href === undefined) throw new Error('the message holds no /admin/auth/confirm link');
  return new URL(href.replace(/&amp;/g, '&'));
}

/**
 * Waits for the address's first message, as delivery is asynchronous: Supabase sends it after
 * answering. Not a retry of anything that failed; it fails with what it saw once time is up.
 */
export async function waitForMessageTo(
  address: string,
  timeoutMs = 15_000,
): Promise<CaughtMessage> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [newest] = await messagesTo(address);
    if (newest !== undefined) return newest;
    if (Date.now() > deadline) throw new Error(`no message reached ${address} in ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
