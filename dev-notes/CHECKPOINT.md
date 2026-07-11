# YARZ Project — CHECKPOINT

See MIGRATION_REPORT.md for the full migration history and current state.

## Quick status (2026-06-20)

- **Architecture:** Customer site on GitHub Pages (ixmaruf/Yarz) + Cloudflare Worker (yarz-api) + Supabase (Postgres) + Admin Panel on GitHub Pages (ixmaruf/Yarz-Pro)
- **Free tier capacity:** ~15K customers/day (Cloudflare 100K requests/day)
- **Data flow:** Admin → Supabase → Worker cache (11ms) → Customer
- **All FIX #1-16 completed in this session**

## Key URLs

- Customer site: https://yarzclothing.xyz
- Admin panel: https://ixmaruf.github.io/Yarz-Pro/
- Cloudflare Worker: https://yarz-api.marufhasan80009.workers.dev
- Supabase project: xdzduowhwubogaavraap

## Login

- Admin credentials stored securely (not in repo)

## Notes

This is a dev-notes file. For production deploy, see `git push` to deploy to GitHub Pages.
