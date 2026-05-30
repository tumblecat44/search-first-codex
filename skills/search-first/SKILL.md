---
name: search-first
description: Use when Knowledge-First hook context is present. The hook is injected on every prompt; use personal JSON Wiki entries first, and if there is no useful Wiki hit for a technical implementation/reference task, perform the injected web searches before implementation.
---

# Knowledge First

If the prompt contains `[Knowledge-First]` injected context, obey it before implementation.

Do not treat the hook as having already searched the web. The hook can read local Wiki JSON, but Codex must perform actual web search when the injected context requires it.

## Workflow

1. Read the injected Knowledge-First context.
2. If the context says no web search is required, stay on the no-web path.
3. Use matching Wiki entries first when they are relevant.
4. If the context includes web search questions, search them before editing files or making technical claims.
5. If the context has matching Wiki entries and no required web search, use those entries first and decide whether web search is still needed.
6. Prefer official docs/help center, official repositories, release notes, and maintainer documentation.
7. Summarize evidence in 1-3 lines.
8. Save reusable development knowledge to the personal JSON wiki with `scripts/knowledge-wiki.mjs` when it will help future sessions.
9. Continue with repo inspection, implementation, and verification.

## Trivial Work

The hook still appears on trivial or no-web prompts. In those cases, follow the no-web decision in the injected context.

When in doubt, follow the injected context literally: Wiki first, then web only when required.
