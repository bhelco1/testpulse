import { unstable_rethrow } from 'next/navigation';

// The server-error page's words (design v21 item 1, components.md "Server error (page)"), here
// rather than in its client component so the pages' heads, on the server, can use the title.

export const SERVER_ERROR_TITLE = 'Couldn’t load · Testament';

export type ServerErrorKind = 'project' | 'run' | 'test';

export const SERVER_ERROR_HEADLINE: Readonly<Record<ServerErrorKind, string>> = {
  project: 'This project couldn’t be loaded',
  run: 'This run couldn’t be loaded',
  test: 'This test’s history couldn’t be loaded',
};

export const SERVER_ERROR_BODY =
  'Its results couldn’t be read just now. Nothing is shown rather than numbers that might be ' +
  'wrong; try again in a minute.';

/** Which page failed, from its path under /p/{slug}. */
export function serverErrorKind(path: string): ServerErrorKind {
  const [, , , section] = path.split('/');
  return section === 'runs' ? 'run' : section === 'tests' ? 'test' : 'project';
}

/**
 * A page head's title, or the server-error page's when its read fails. Next.js renders a head's
 * error outside the route's error boundary, as its bare error document, so the head answers with
 * the error page's title and the page's own read reaches the boundary. The loaders' messages name
 * the query and Postgres's code, never a key or a row.
 */
export async function headTitle(read: () => Promise<string>): Promise<string> {
  try {
    return await read();
  } catch (error) {
    unstable_rethrow(error);
    console.error(error instanceof Error ? error.message : error);
    return SERVER_ERROR_TITLE;
  }
}
