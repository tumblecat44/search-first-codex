---
name: search-first
description: Use when Search-First hook context is present, or before development/implementation/debugging/architecture/plugin/SDK/API/framework work where the request is not trivial local/text work. Follow injected search terms and perform web search before editing or making technical claims.
---

# Search First

If the prompt contains `[Search-First]` injected context, obey it before implementation.

Do not treat the hook as having already searched. The hook only suggested search terms. You must perform the actual web search.

## Workflow

1. Read the injected Search-First context.
2. If the user explicitly says no-web/local-only, do not search.
3. Otherwise search the suggested terms before editing files or making technical claims.
4. Prefer official docs/help center, official repositories, release notes, and maintainer documentation.
5. Summarize evidence in 1-3 lines.
6. Continue with repo inspection, implementation, and verification.

## Trivial Work

Skip search only for explicit no-web/local-only work, provided-text translation or cleanup, specific local-file summaries, repo-local lookups, mechanical edits, or command-output explanations.

When in doubt, search first.
