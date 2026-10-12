# NotebookSpace Vercel hosting

The frontend project is `notebookspace` (`prj_HoYYB09igMPYoKOgzczCY9rZcyHG`) in the existing Hobby workspace that also hosts RoleRadar. Production initially uses main commit `60b7c56`; the separate visual-overhaul branch is not merged.

## Project settings

- Framework: Vite
- Root directory: `frontend`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- Frontend environment variable: `VITE_API_BASE_URL=/api` for production, preview, and development

## Project-level routing

These rules are configured in the Vercel project for production, rather than requiring a commit to main:

1. `^/api/(.*)$` rewrites to `https://notebookspace-api.onrender.com/$1`. This keeps browser calls same-origin while preserving the existing Render API.
2. `^/(?:subject(?:/.*)?|dashboard/?|demo/?)$` rewrites to `/index.html`, allowing browser reloads on React deep links. Static assets keep their normal paths.

The backend, database, AI provider, and Netlify site remain unchanged. Guest authentication is stored in browser localStorage: a guest workspace on the Netlify origin does not automatically follow to the Vercel origin. Keep the old Netlify link available for existing guest sessions. Do not delete the Netlify site as part of this migration.

## Cutover

Production URL: https://notebookspace.vercel.app

Netlify automatic builds are stopped; the previously published Netlify site and preview remain available. Future production pushes should build on Vercel. Guest-session initialization and the backend health endpoint were verified through the same-origin proxy, and dashboard deep links returned the app.

Preview routing: project-level routing rules only applied to production in verification. The visual-overhaul branch therefore includes `frontend/vercel.json` with an API rewrite and SPA fallback. Its push triggered a Vercel preview automatically, confirming the Git connection.
