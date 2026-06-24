# Cubic Ship Supabase Setup

The public anon key can live in browser/server config, but the service role key must stay server-only in Vercel env vars.

1. Open Supabase SQL Editor and run `supabase/cubicship_schema.sql`.
2. In Vercel, add these production environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Redeploy the site.

After all three env vars exist, customer registration/login uses Supabase Auth and writes customer profile rows to `customer_profiles`. If the env vars are missing, the site falls back to the current Vercel Blob customer store so the live Profile page keeps working.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in JavaScript served to the browser, GitHub, screenshots, chat messages, or static HTML.
