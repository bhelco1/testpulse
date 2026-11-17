-- Anon gets the 8-second statement timeout authenticated already has (decision 2026-11-17).
-- At 3 seconds, overlapping page loads on the free tier's shared CPU had PostgREST cancel reads
-- that take milliseconds alone (57014), and the pages failed. A stopgap until the public pages'
-- reads are cached and refreshed by ingest; it returns to 3 seconds then.
alter role anon set statement_timeout = '8s';

-- PostgREST applies a role's settings as of its last config load.
notify pgrst, 'reload config';
