# Search First Codex Plugin

Search First now runs as a Knowledge-First prompt hook on every `UserPromptSubmit` event. It always injects hook context. The hook checks the personal JSON Knowledge Wiki first, then decides whether web search is required.

The hook does not perform web search. It reads local JSON knowledge and injects `[Knowledge-First]` context. If the classifier matches a technical implementation/reference task and there is no useful Wiki hit, it tells Codex to perform web search before implementation. If the Wiki has a useful hit, Codex can proceed from that context unless freshness verification is needed.

Search First also includes a small personal Knowledge Wiki CLI. It stores reusable development knowledge from search sessions in JSON so later sessions can search and reuse what was already learned.

The goal prompt writing history for submission is recorded in `docs/goal-prompt-history.md`.

## What It Does

- Injects `[Knowledge-First]` guidance on every prompt.
- Searches the local JSON Knowledge Wiki before deciding on web search.
- Suggests implementation-focused search questions, not bare product names.
- Keeps explicit no-web/local-only and trivial local/text tasks in a no-web decision path while still injecting hook context.
- Stores reusable search findings in a local JSON wiki when requested by the agent or user.

Example trigger:

```text
React로 접근성 좋은 팝업 UI 만들어줘.
```

Expected injected searches include:

```text
React accessible modal dialog official docs
React popup modal focus trap aria dialog current best practices
```

## Install

Clone the repository:

```bash
git clone https://github.com/tumblecat44/search-first-codex.git
cd search-first-codex
```

Add it as a local marketplace source:

```bash
codex plugin marketplace add "$(pwd)"
node scripts/install-user-hook.mjs
```

After GitHub publishing, the same marketplace can be added from the repository:

```bash
codex plugin marketplace add tumblecat44/search-first-codex
```

The installer preserves existing `UserPromptSubmit` behavior by wrapping it in `scripts/search-first-chain-hook.mjs`, updates `~/.codex/hooks.json`, and writes the matching trusted hook state into `~/.codex/config.toml`. This is required for Codex CLI surfaces that register marketplaces but do not automatically merge plugin-scoped hooks.

## Verify

Run automated tests:

```bash
node --test tests/knowledge-wiki.test.mjs
node --test tests/search-first-hook.test.mjs
node --test tests/install-user-hook.test.mjs
node scripts/search-first-hook.mjs < tests/fixtures/codex-plugin.json
node scripts/search-first-hook.mjs < tests/fixtures/local-only.json
node scripts/search-first-hook.mjs < tests/fixtures/no-web.json
node scripts/search-first-hook.mjs < tests/fixtures/react-popup.json
node scripts/search-first-hook.mjs < tests/fixtures/nextjs-auth.json
```

Run a separate Codex session with web search enabled:

```bash
TMPDIR=$(mktemp -d)
printf "# Smoke\n" > "$TMPDIR/README.md"
node scripts/install-user-hook.mjs --diagnostic-log "$TMPDIR/search-first-hook.jsonl"
codex --search exec --cd "$TMPDIR" "코덱스 플러그인 만들거임. 간단한 README 작성해줘."
cat "$TMPDIR/search-first-hook.jsonl"
node scripts/install-user-hook.mjs
```

Expected:

- `[Knowledge-First]` context is present.
- If the classifier matches a technical implementation/reference task and the Wiki has no useful hit, Codex searches before editing or making technical claims.

No-web check:

```bash
codex --search exec --cd "$TMPDIR" "검색하지 말고 현재 README.md만 요약해줘."
```

Expected:

- `[Knowledge-First]` context is still present.
- No web search.

## Knowledge Wiki

The wiki is local-first and dependency-free. By default it writes to:

```bash
~/.codex/search-first/wiki.json
```

Override the path for tests or project-local experiments:

```bash
SEARCH_FIRST_WIKI_PATH=.context/search-first-wiki.json node scripts/knowledge-wiki.mjs path
```

Add a finding:

```bash
node scripts/knowledge-wiki.mjs add \
  --title "React modal accessibility" \
  --query "React accessible modal dialog official docs" \
  --summary "Use ARIA dialog semantics and restore focus after close." \
  --tag react,a11y \
  --source "https://react.dev|React docs|Reference source"
```

Search saved knowledge as JSON:

```bash
node scripts/knowledge-wiki.mjs search "react modal focus" --json
```

Hook behavior:

```text
1. Prompt arrives.
2. Hook always injects `[Knowledge-First]` context.
3. Hook classifies whether the prompt requires web search evidence.
4. Hook searches the local Knowledge Wiki JSON.
5. If useful entries exist, it injects those entries as context.
6. If the classifier matched a technical implementation/reference task and the Wiki has no useful hit, it injects web search questions.
7. If the Wiki has a useful hit, Codex uses that first and decides whether web search is still needed.
8. If the prompt is no-web/local-only or trivial local/text work, the hook injects a passive no-web decision instead.
9. Reusable web findings can be saved back into the Wiki.
```

Add from structured JSON:

```bash
printf '%s\n' '{"title":"Codex hook additionalContext","query":"Codex UserPromptSubmit hook additionalContext","summary":"Hooks can inject developer context through additionalContext.","tags":["codex","hooks"]}' \
  | node scripts/knowledge-wiki.mjs add
```

## Files

- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `hooks.json`
- `scripts/search-first-hook.mjs`
- `scripts/search-first-chain-hook.mjs`
- `scripts/prompt-classifier.mjs`
- `scripts/knowledge-wiki.mjs`
- `scripts/install-user-hook.mjs`
- `skills/search-first/SKILL.md`
- `skills/search-first/agents/openai.yaml`
- `tests/search-first-hook.test.mjs`
- `tests/knowledge-wiki.test.mjs`
- `tests/fixtures/*.json`
- `docs/goal-prompt-history.md`
- `SPEC.md`
