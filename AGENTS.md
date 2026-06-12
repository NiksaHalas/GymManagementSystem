<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.
Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project source of truth
Before implementing features, check the relevant project docs:
- Product requirements: `docs/PRD.md`
- Architecture: `docs/Tech.md`
- Database schema: `docs/DB.md`

Rules:
- Do not invent product requirements that are not in PRD/SoW.
- Follow the architecture/tech docs before introducing new patterns.
- Follow the database schema before creating or changing tables.
- Follow the design system from cursor rules before building UI.
