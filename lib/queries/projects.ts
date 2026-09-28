import { z } from 'zod';

import { createPublicClient, type PublicClient } from '../supabase/public.ts';

// Rows come from PostgREST, a trust boundary like any other, so they are parsed rather than cast.

const PROJECT_COLUMNS = 'id, slug, name, visibility, repo_url';

const PublicProjectRowSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    visibility: z.enum(['public', 'private']),
    // projects_public nulls it for a private project (spec section 9).
    repo_url: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    repoUrl: row.repo_url,
  }));

export type PublicProject = z.output<typeof PublicProjectRowSchema>;

/** Every project in dashboard order, as anon sees it. */
export async function listPublicProjects(
  client: PublicClient = createPublicClient(),
): Promise<PublicProject[]> {
  const { data, error } = await client
    .from('projects_public')
    .select(PROJECT_COLUMNS)
    .order('sort_order')
    .order('slug');
  if (error) throw new Error(`list public projects: ${error.code} ${error.message}`);
  const parsed = z.array(PublicProjectRowSchema).safeParse(data);
  if (!parsed.success) throw new Error('list public projects returned an unexpected row');
  return parsed.data;
}
