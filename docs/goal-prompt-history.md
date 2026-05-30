# Goal Prompt Writing History

This document records how the development goal prompt for `search-first-codex` was written, refined, and verified.

## Purpose

The submitted goal prompt was not a one-shot request. It was built from a requirements conversation about a Codex plugin that forces Codex to look for current external knowledge before non-trivial technical work.

The final goal had to produce more than a local prototype:

- an installable Codex plugin repository
- a `UserPromptSubmit` hook
- a skill contract
- automated tests
- a terminal Codex integration test
- a public GitHub repository that another user can install

## Requirement Collection Notes

| Step | User requirement | How it shaped the goal prompt |
| --- | --- | --- |
| 1 | Build a Codex plugin that searches first when the agent might not know something. | The goal became a Codex hook plugin, not a normal script or app. |
| 2 | Do not use Python/TypeScript logic to perform web search directly. Codex itself should read injected context and search. | The hook is limited to prompt classification and `additionalContext` injection. It never performs web search. |
| 3 | Use Codex skills and understand how skills are made. | The deliverable includes `skills/search-first/SKILL.md` and an agent descriptor. |
| 4 | Phrase the rule as "search unless this is trivial," not "search if keyword exists." | The prompt defines narrow trivial local/text exceptions and treats search as the default for technical work. |
| 5 | Define trivial local/text work clearly because AI will otherwise misread it. | The SPEC includes explicit allowed skip categories: provided text only, specific local file only, repo-local lookup, mechanical edit, and command output explanation. |
| 6 | Codex hook should inject guidance when the prompt is submitted. | The implementation targets `UserPromptSubmit` and `hookSpecificOutput.additionalContext`. |
| 7 | Include examples that must search, including technical implementation intent, not generic product definitions. | Fixtures assert that `React popup UI` searches modal/dialog implementation guidance, not `React` itself. |
| 8 | Goal mode must be able to judge success. | The SPEC includes a Done / Not Done Gate with terminal Codex integration and GitHub publishing as hard requirements. |
| 9 | Test validity must be explainable. | The final verification requires unit tests, direct hook fixture simulations, and a separate `codex --search exec` smoke test. |
| 10 | Completion means anyone can install from GitHub. | The final goal includes public repo creation, README install commands, and a fresh marketplace add check from GitHub. |

## Final Copy-Ready Goal Prompt

The final goal prompt was included in `SPEC.md` under `Copy-Ready Development Goal`:

```md
/goal Build the Search-First Codex hook plugin described in SPEC.md.

Workspace:
- /Users/dgsw67/Documents/ralphthon-busan

Goal:
- Create a local Codex plugin named search-first.
- It should use a UserPromptSubmit hook to inspect each prompt before Codex starts work.
- If the prompt is not trivial local/text work and does not explicitly forbid web search, inject Search-First additionalContext telling Codex what to search before implementation.
- The hook must not perform web search itself. Codex performs web_search after reading the injected context.
- The finished result must be an installable public GitHub repository named search-first-codex, not just local files.

Scope:
- Include hook + skill.
- No external search API.
- No API keys.
- Respect explicit no-web/local-only user instructions.
- Keep trivial local/text work narrowly defined by SPEC.md.

Required files:
- .codex-plugin/plugin.json
- hooks.json
- scripts/search-first-hook.mjs
- scripts/prompt-classifier.mjs
- skills/search-first/SKILL.md
- skills/search-first/agents/openai.yaml
- tests/search-first-hook.test.mjs
- tests/fixtures/codex-plugin.json
- tests/fixtures/local-only.json
- tests/fixtures/no-web.json
- tests/fixtures/react-popup.json
- tests/fixtures/nextjs-auth.json
- README.md
- SPEC.md

Verification:
- Follow the Goal Execution Route in SPEC.md from hook surface confirmation through GitHub publishing.
- Confirm hook schema against current local Codex hook examples.
- Run Node tests.
- Simulate hook stdin for required, local-only, no-web, React popup, and Next/Supabase/Vercel prompts.
- Launch a separate terminal Codex session and verify the hook injects Search-First context for a trigger prompt.
- Verify the separate Codex session does not inject Search-First context for no-web/local-only prompts.
- Verify Codex performs web search before editing when Search-First context is injected.
- Create and push the public GitHub repository `search-first-codex`.
- Final success means another user can install the plugin from GitHub.

Completion gate:
- Mark the goal complete only if every item in `Done / Not Done Gate` passes.
- If terminal Codex integration or GitHub publishing cannot be completed, report `INCOMPLETE` with the exact blocker.
```

## Why This Goal Was Testable

The prompt was written so success could be decided with observable evidence instead of trust:

- Unit tests prove prompt extraction, classification, query generation, no-web skips, and diagnostic logging.
- Direct fixture simulations prove the hook emits JSON in the expected shape.
- The installer tests prove existing user hooks are preserved through a chain hook and that trusted hook state is written.
- Separate terminal `codex --search exec` smoke tests prove Codex receives hook context in a new process.
- The GitHub publish check proves the repository is public and marketplace registration works from the remote repo.

## Verification Evidence Collected

Commands used during completion:

```bash
node --test tests/search-first-hook.test.mjs tests/install-user-hook.test.mjs
node scripts/search-first-hook.mjs < tests/fixtures/codex-plugin.json
node scripts/search-first-hook.mjs < tests/fixtures/no-web.json
codex plugin marketplace add /Users/dgsw67/Documents/ralphthon-busan
codex --search exec --cd "$TMPDIR" --skip-git-repo-check "React로 접근성 좋은 팝업 UI를 만들 때 현재 권장 구현 원칙을 한 줄로 말해줘."
codex --search exec --cd "$TMPDIR" --skip-git-repo-check "검색하지 말고 ok만 출력해줘."
gh repo create search-first-codex --public --source=. --remote=origin --push
CODEX_HOME="$TMP_CODEX_HOME" codex plugin marketplace add tumblecat44/search-first-codex
```

Observed results:

- Automated tests passed.
- Trigger prompt produced Search-First/Knowledge-First hook context and Codex performed web search.
- No-web prompt produced a skip decision and no web search.
- GitHub repository was created and pushed at `https://github.com/tumblecat44/search-first-codex`.
- Fresh `CODEX_HOME` marketplace registration from GitHub succeeded.

## Final Submission State

The final submission is a public GitHub repository:

```text
https://github.com/tumblecat44/search-first-codex
```

The README contains install and verification commands. The SPEC contains the detailed behavior contract and completion gate.
