# Search First Codex Plugin

Search First injects prompt-time guidance into Codex through a `UserPromptSubmit` hook. When a request is not trivial local/text work, the hook tells Codex what to search before implementation.

The hook does not perform web search. It only injects `[Search-First]` context. Codex performs the actual web search after reading that context.

## What It Does

- Injects `[Search-First]` guidance for technical/development prompts.
- Suggests implementation-focused search questions, not bare product names.
- Skips explicit no-web/local-only work.
- Skips trivial text/local tasks such as translation, local file summaries, repo-local lookups, and mechanical edits.

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

- `[Search-First]` context is present.
- Codex searches before editing or making technical claims.

No-web check:

```bash
codex --search exec --cd "$TMPDIR" "검색하지 말고 현재 README.md만 요약해줘."
```

Expected:

- No `[Search-First]` context.
- No web search.

## Files

- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `hooks.json`
- `scripts/search-first-hook.mjs`
- `scripts/search-first-chain-hook.mjs`
- `scripts/prompt-classifier.mjs`
- `scripts/install-user-hook.mjs`
- `skills/search-first/SKILL.md`
- `skills/search-first/agents/openai.yaml`
- `tests/search-first-hook.test.mjs`
- `tests/fixtures/*.json`
- `SPEC.md`
