// URL validation shared by the secret and publishable-key clients. The URL is public, so unlike
// either key it may be echoed back in an error.

export const URL_VAR = 'NEXT_PUBLIC_SUPABASE_URL';

/** Longest prefix of a bad URL worth echoing; enough to see the mistake, short enough to read. */
const ECHO_LIMIT = 60;

/**
 * The value as configured, quoted and with whitespace spelled out, because the mistakes this
 * catches are a copied newline, a stray space and a pasted pair of quotes: all invisible
 * otherwise. Only ever applied to the URL; never to a key.
 */
function echoed(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  const capped = escaped.length > ECHO_LIMIT ? `${escaped.slice(0, ECHO_LIMIT)}…` : escaped;
  return `"${capped}"`;
}

export function isHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

// supabase-js rejects a malformed URL from inside a minified stack, which named nothing an
// operator could act on. Checking it first names the variable and shows the offending value.
export function invalidUrlError(configuredUrl: string): Error {
  return new Error(
    `${URL_VAR} is not an absolute http or https URL: ${echoed(configuredUrl)}. ` +
      'Expected a value like https://<project-ref>.supabase.co.',
  );
}
