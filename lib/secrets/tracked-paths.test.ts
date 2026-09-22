import { describe, expect, it } from 'vitest';

import { findSuspiciousPaths } from './tracked-paths';

const paths = (result: ReturnType<typeof findSuspiciousPaths>): string[] =>
  result.map((entry) => entry.path);

describe('findSuspiciousPaths', () => {
  it('returns an empty list for empty input', () => {
    expect(findSuspiciousPaths([])).toEqual([]);
  });

  it('returns nothing for ordinary source files', () => {
    expect(
      findSuspiciousPaths(['package.json', 'app/page.tsx', 'lib/secrets/tracked-paths.ts']),
    ).toEqual([]);
  });

  it('preserves input order and deduplicates repeated paths', () => {
    const result = findSuspiciousPaths([
      'certs/b.pem',
      '.env',
      'certs/a.key',
      '.env',
      'certs/b.pem',
    ]);
    expect(paths(result)).toEqual(['certs/b.pem', '.env', 'certs/a.key']);
  });

  it('matches on the basename of nested paths', () => {
    expect(
      paths(
        findSuspiciousPaths([
          'config/prod/.env.production',
          'iosApp/iosApp/Secrets.swift',
          'deploy/certs/server.pem',
          'terraform/envs/prod.tfvars',
        ]),
      ),
    ).toEqual([
      'config/prod/.env.production',
      'iosApp/iosApp/Secrets.swift',
      'deploy/certs/server.pem',
      'terraform/envs/prod.tfvars',
    ]);
  });

  it('does not match a secret-like name that appears only as a directory', () => {
    expect(findSuspiciousPaths(['.env/README.md', 'id_rsa/notes.txt'])).toEqual([]);
  });

  it('does not normalize case: rules match the exact names git stores', () => {
    expect(
      findSuspiciousPaths([
        '.ENV',
        '.Env.local',
        'SERVER.PEM',
        'secrets.swift',
        'ID_RSA',
        '.NPMRC',
      ]),
    ).toEqual([]);
  });

  it('reports a reason with each flagged path', () => {
    expect(findSuspiciousPaths(['.env.local'])).toEqual([
      { path: '.env.local', reason: 'dotenv file' },
    ]);
  });

  describe('rule: dotenv file', () => {
    it.each(['.env', '.env.local', '.env.production', '.env.development.local', 'api/.env'])(
      'flags %s',
      (path) => {
        expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
      },
    );

    it.each(['.env.example', '.env.local.example', '.env.production.example', '.envrc', 'env'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: private key or certificate store', () => {
    it.each([
      'server.pem',
      'server.key',
      'client.p12',
      'client.pfx',
      'release.jks',
      'release.keystore',
    ])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each([
      'server.pem.md',
      'keys.ts',
      'p12.txt',
      'pfx.txt',
      'jks.txt',
      'keystore.txt',
      'server.crt',
    ])('does not flag %s', (path) => {
      expect(findSuspiciousPaths([path])).toEqual([]);
    });
  });

  describe('rule: SSH private key', () => {
    it.each(['id_rsa', 'id_ed25519', 'id_ecdsa', '.ssh/id_rsa'])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub', 'id_rsa.txt', 'my_id_rsa'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: Xcode secrets file', () => {
    it.each(['Secrets.swift', 'Secrets.xcconfig', 'iosApp/Secrets.xcconfig'])(
      'flags %s',
      (path) => {
        expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
      },
    );

    it.each(['Secrets.example.swift', 'SecretsView.swift', 'Config.xcconfig'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: Android local properties', () => {
    it.each(['local.properties', 'android/local.properties'])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['gradle.properties', 'local.properties.example'])('does not flag %s', (path) => {
      expect(findSuspiciousPaths([path])).toEqual([]);
    });
  });

  describe('rule: Firebase app configuration', () => {
    it.each(['google-services.json', 'GoogleService-Info.plist', 'app/google-services.json'])(
      'flags %s',
      (path) => {
        expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
      },
    );

    it.each(['google-services.json.example', 'Info.plist', 'services.json'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: service account credentials', () => {
    it.each([
      'credentials.json',
      'service-account.json',
      'service-account-prod.json',
      'gcp/service-account.staging.json',
    ])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['credentials.example.json', 'service-account.json.example', 'service-accounts.md'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: Supabase JWT signing keys', () => {
    it.each(['signing_keys.json', 'supabase/signing_keys.json'])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['signing_keys.json.example', 'signing_keys.md', 'keys.json'])(
      'does not flag %s',
      (path) => {
        expect(findSuspiciousPaths([path])).toEqual([]);
      },
    );
  });

  describe('rule: registry or network credentials', () => {
    it.each(['.npmrc', '.netrc', 'packages/app/.npmrc'])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['.nvmrc', '.npmrc.example', 'netrc.md'])('does not flag %s', (path) => {
      expect(findSuspiciousPaths([path])).toEqual([]);
    });
  });

  describe('rule: Terraform variables', () => {
    it.each(['prod.tfvars', 'terraform.tfvars', 'infra/prod.tfvars'])('flags %s', (path) => {
      expect(paths(findSuspiciousPaths([path]))).toEqual([path]);
    });

    it.each(['main.tf', 'variables.tf', 'prod.tfvars.example'])('does not flag %s', (path) => {
      expect(findSuspiciousPaths([path])).toEqual([]);
    });
  });
});
