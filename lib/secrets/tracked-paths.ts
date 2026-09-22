export interface SuspiciousPath {
  readonly path: string;
  readonly reason: string;
}

interface Rule {
  readonly reason: string;
  readonly test: (basename: string) => boolean;
}

const named =
  (...names: readonly string[]) =>
  (basename: string): boolean =>
    names.includes(basename);

const withExtension =
  (...extensions: readonly string[]) =>
  (basename: string): boolean =>
    extensions.some((extension) => basename.endsWith(extension));

const rules: readonly Rule[] = [
  {
    reason: 'dotenv file',
    test: (basename) =>
      basename === '.env' || (basename.startsWith('.env.') && !basename.endsWith('.example')),
  },
  {
    reason: 'private key or certificate store',
    test: withExtension('.pem', '.key', '.p12', '.pfx', '.jks', '.keystore'),
  },
  { reason: 'SSH private key', test: named('id_rsa', 'id_ed25519', 'id_ecdsa') },
  { reason: 'Xcode secrets file', test: named('Secrets.swift', 'Secrets.xcconfig') },
  { reason: 'Android local properties', test: named('local.properties') },
  {
    reason: 'Firebase app configuration',
    test: named('google-services.json', 'GoogleService-Info.plist'),
  },
  {
    reason: 'service account credentials',
    test: (basename) =>
      basename === 'credentials.json' ||
      (basename.startsWith('service-account') && basename.endsWith('.json')),
  },
  { reason: 'Supabase JWT signing keys', test: named('signing_keys.json') },
  { reason: 'registry or network credentials', test: named('.npmrc', '.netrc') },
  { reason: 'Terraform variables', test: withExtension('.tfvars') },
];

const basenameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function findSuspiciousPaths(paths: readonly string[]): SuspiciousPath[] {
  const seen = new Set<string>();
  const found: SuspiciousPath[] = [];

  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);

    const basename = basenameOf(path);
    const rule = rules.find((candidate) => candidate.test(basename));
    if (rule !== undefined) {
      found.push({ path, reason: rule.reason });
    }
  }

  return found;
}
