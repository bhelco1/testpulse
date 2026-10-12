import { z } from 'zod';

import { createPublicClient, type PublicClient } from '../supabase/public.ts';

// The landing page's one read about a tracked visitor (spec sections 9 and 13.3): the slug of the
// lead project of the link the session arrived by, or null. It goes through
// lead_project_for_session, the one function anon may call that reads tracked links, which
// answers that slug and nothing else; anon can read neither tracked_links nor tracked_sessions.

const LeadSchema = z.string().min(1).nullable();

export async function loadLeadProject(
  sessionId: string | null,
  client: PublicClient = createPublicClient(),
): Promise<string | null> {
  if (sessionId === null) return null;
  const { data, error } = await client.rpc('lead_project_for_session', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(`lead_project_for_session: ${error.code} ${error.message}`);
  const parsed = LeadSchema.safeParse(data);
  if (!parsed.success) throw new Error('lead_project_for_session returned an unexpected value');
  return parsed.data;
}
