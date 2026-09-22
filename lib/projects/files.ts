import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { type ProjectFile, ProjectFileError, SlugSchema, parseProjectFile } from './schema.ts';

// Relative to the working directory: npm always runs the scripts from the package root, and a
// relative default lets tests point the scripts at a throwaway directory.
export const PROJECTS_DIR = 'projects';

const YAML_EXTENSION = '.yaml';

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** The path of a slug's file, refusing slugs that could name a file outside the directory. */
export function projectFilePath(slug: string, dir: string = PROJECTS_DIR): string {
  const parsed = SlugSchema.safeParse(slug);
  if (!parsed.success) {
    throw new Error(`invalid slug "${slug}": ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  }
  return join(dir, `${parsed.data}${YAML_EXTENSION}`);
}

/** Reads and validates one file, which must be named after the slug it declares (section 10). */
export function loadProjectFile(filePath: string): ProjectFile {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new ProjectFileError(filePath, [{ path: '', message: 'file not found' }]);
    }
    throw error;
  }

  const file = parseProjectFile(text, filePath);
  const expectedSlug = basename(filePath, YAML_EXTENSION);
  if (file.slug !== expectedSlug) {
    throw new ProjectFileError(filePath, [
      {
        path: 'slug',
        message: `file is named "${expectedSlug}" but declares slug "${file.slug}"`,
      },
    ]);
  }
  return file;
}

export interface LoadedProjectFiles {
  /** Valid files in slug order. */
  readonly files: readonly ProjectFile[];
  /** One error per invalid file, so a sync can report all of them in one run. */
  readonly errors: readonly ProjectFileError[];
}

export function loadProjectFiles(dir: string = PROJECTS_DIR): LoadedProjectFiles {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (isMissingFile(error)) {
      throw new Error(`projects directory "${dir}" not found`);
    }
    throw error;
  }

  const files: ProjectFile[] = [];
  const errors: ProjectFileError[] = [];
  for (const name of names.filter((candidate) => candidate.endsWith(YAML_EXTENSION)).sort()) {
    try {
      files.push(loadProjectFile(join(dir, name)));
    } catch (error) {
      if (error instanceof ProjectFileError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  }
  return { files, errors };
}
