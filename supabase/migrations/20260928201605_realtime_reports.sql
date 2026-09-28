-- Spec section 4: the browser learns of new results from report inserts. Every reports column is
-- public, so anon may receive them. runs, result_failures and projects hold hidden data and stay
-- out of this publication.
alter publication supabase_realtime add table public.reports;
