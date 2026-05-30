# SPEC: Search-First Codex Hook Plugin

## One-Line Concept

Codex 프롬프트 입력 시점에 `UserPromptSubmit` hook이 사용자 요청을 읽고, 검색하지 않아도 되는 하찮은 로컬/텍스트 작업이 아니면 "먼저 이런 것을 검색해라"라는 개발자 컨텍스트를 자동 주입하는 Codex 플러그인.

## Core Idea

이 플러그인은 hook이 직접 웹 검색을 하지 않는다.

hook의 역할:

1. 사용자가 프롬프트를 입력한다.
2. `UserPromptSubmit` hook이 프롬프트를 읽는다.
3. 검색 생략 가능한 하찮은 작업인지 판단한다.
4. 아니면 요청 안의 모든 기술적 검색 의도와 검색 의무를 `hookSpecificOutput.additionalContext`로 주입한다.
5. Codex 본체가 주입된 컨텍스트를 읽고 실제 `web_search`를 먼저 수행한다.
6. 검색 근거를 짧게 남긴 뒤 개발/설계/수정으로 넘어간다.

skill의 역할:

- hook이 주입한 Search-First 컨텍스트를 따라야 한다는 행동 계약을 제공한다.
- hook이 없는 환경에서도 skill이 켜지면 같은 검색 우선 규칙을 따르게 한다.

## Product Goal

`search-first`라는 Codex 플러그인을 만든다.

v1의 성공 기준:

- 플러그인은 `UserPromptSubmit` hook을 포함한다.
- hook은 검색을 직접 실행하지 않는다.
- hook은 사용자의 프롬프트를 읽고, 필요한 경우 검색 지시문을 자동 주입한다.
- Codex는 주입문을 보고 구현 전에 웹 검색한다.
- skill은 hook 주입문을 따르는 보조 행동 계약으로 포함한다.

OpenAI 공식 설명 기준으로, Codex 플러그인은 재사용 가능한 workflow를 패키징하는 단위이며, 하나 이상의 skills, 선택적 앱 통합, MCP server config를 묶을 수 있다. Skills는 재사용 workflow를 작성하는 형식이고, 플러그인은 설치 가능한 배포 단위다.

로컬 근거:

- 현재 설치된 Codex/OMX hook 설정에는 `UserPromptSubmit` event가 존재한다.
- 로컬 hook 테스트와 구현은 `hookSpecificOutput.additionalContext`를 사용해 프롬프트 쪽 컨텍스트를 주입하는 패턴을 갖고 있다.
- 따라서 v1은 `UserPromptSubmit` + `additionalContext` 기반으로 설계한다.

## Target Behavior

### Default Rule

검색은 특정 키워드가 있을 때만 켜지는 기능이 아니다.

프롬프트가 검색 생략 가능한 하찮은 로컬/텍스트 작업이 아니라면, hook은 Codex에게 먼저 검색하라는 컨텍스트를 주입한다.

실행 순서:

1. **Read Prompt**
   - hook이 사용자 프롬프트를 stdin payload에서 읽는다.
2. **No-Web Check**
   - 사용자가 `검색하지 마`, `no web`, `local only`처럼 명시적으로 검색 금지를 말했는지 본다.
3. **Triviality Check**
   - 요청이 검색 생략 가능한 하찮은 로컬/텍스트 작업인지 본다.
4. **Build Search Prompt**
   - 예외가 아니면 요청 안의 모든 기술적 검색 의도를 검색 지시로 만든다.
   - 검색어는 사용자의 원문 전체가 아니라 최소한의 공개 기술 키워드만 사용한다.
   - 기술 이름 자체를 설명하기 위한 검색은 피하고, 사용자가 실제로 하려는 구현/설계/연동 방법을 검색한다.
5. **Inject Context**
   - `hookSpecificOutput.additionalContext`에 Search-First 지시문을 넣는다.
6. **Codex Searches**
   - Codex는 파일 수정, 설계 확정, 의존성 추가 전에 주입문에 따라 웹 검색한다.
7. **Proceed**
   - 검색 근거를 1-3줄로 요약한 뒤 원래 작업을 진행한다.

## Search By Default Unless Trivial

검색해야 하는지 판단할 때는 "무슨 키워드가 있으면 검색"이 아니라 "검색하지 않아도 되는 하찮은 작업인가?"를 먼저 묻는다.

여기서 "하찮은 로컬/텍스트 작업"은 아래 조건에 들어맞는 작업만 의미한다. Codex나 hook이 넓게 해석해서 검색을 생략하면 안 된다.

### Trivial Local/Text Work Definition

검색을 생략할 수 있는 하찮은 작업은 다음뿐이다:

- **Provided-text only**
  - 사용자가 메시지 안에 제공한 텍스트를 번역, 요약, 문장 다듬기, 톤 변경, 맞춤법 수정, 포맷 변경만 하는 작업
  - 예: "이 문장 자연스럽게 바꿔줘", "아래 내용을 영어로 번역해줘"
- **Specific local file only**
  - 사용자가 특정 파일만 읽고 설명/요약/정리하라고 한 작업
  - 예: "`SPEC.md`만 보고 요약해줘", "이 파일에서 TODO만 찾아줘"
- **Repo-local lookup only**
  - repo 안의 파일, 함수, 컴포넌트, route, 설정 위치를 찾는 작업
  - 예: "Button 컴포넌트 어디 있어?", "이 API route 파일 찾아줘"
- **Mechanical local edit**
  - 외부 지식 없이 가능한 이름 변경, 문구 변경, dead text 제거, markdown 정리, import 정렬 같은 기계적 수정
  - 예: "README 오타 고쳐줘", "이 제목을 바꿔줘"
- **Command output explanation**
  - 사용자가 제공했거나 방금 실행한 로컬 명령 출력만 설명하는 작업
  - 예: "`date` 결과 알려줘", "이 test output 무슨 뜻이야?"

하찮은 작업이 아닌 것:

- 구현 방식 선택
- architecture/SPEC/PRD/test plan 작성
- 새 파일 구조 설계
- dependency/API/SDK/framework/plugin/skill 관련 판단
- 에러 원인 추정이 외부 라이브러리 동작에 걸린 경우
- "만드는 법", "최신 방식", "현재 기준", "이게 맞나" 류의 방법론 판단

검색하는 것이 기본값인 요청:

- 개발, 구현, 디버깅, 리팩터링, architecture, SPEC 작성
- plugin, skill, MCP, automation, extension, CLI integration
- 외부 제품, SDK, API, framework, library, SaaS, platform
- 패키지 선택, dependency upgrade, migration, compatibility 판단
- 공식문서, 만드는 법, 사용법, 설정법, 배포법, 정책, 가격, quota, rate limit
- Codex가 조금이라도 모를 수 있는 용어가 포함된 요청
- Codex가 알더라도 최근에 바뀌었을 가능성이 있는 요청

검색 생략은 예외다. 생략하려면 아래 no-web/local-only 규칙에 명확히 걸려야 한다.

## What To Search

hook은 단순히 명사 키워드를 검색하지 않는다. 사용자의 요구사항에서 실제로 구현 판단에 필요한 기술적 질문을 만들어 검색한다.

원칙:

- `React`가 무엇인지 검색하지 않는다.
- `Next.js`가 무엇인지 검색하지 않는다.
- `Stripe`가 무엇인지 검색하지 않는다.
- 대신 사용자가 하려는 작업의 현재 권장 구현법, 공식 API 사용법, 주의할 변경점, 플랫폼 제약을 검색한다.

검색 예시:

- User: `React로 팝업 UI 만들어줘`
  - Bad search: `React`
  - Good search: `React accessible modal dialog official docs`, `React popup modal focus trap aria dialog current best practices`
- User: `Next.js에서 로그인 middleware 만들어줘`
  - Bad search: `Next.js`
  - Good search: `Next.js middleware authentication official docs`, `Next.js current middleware matcher cookies auth`
- User: `Supabase auth 붙여줘`
  - Bad search: `Supabase`
  - Good search: `Supabase auth JavaScript current docs`, `Supabase auth SSR Next.js official docs`
- User: `코덱스 플러그인 만들거임`
  - Bad search: `Codex`
  - Good search: `OpenAI Codex plugin skills documentation`, `Codex plugin hooks UserPromptSubmit additionalContext`
- User: `Stripe subscription migration 해줘`
  - Bad search: `Stripe`
  - Good search: `Stripe subscription migration latest API docs`, `Stripe billing subscriptions migration changelog`

검색 지시는 숫자 제한을 두지 않는다. 요청에 독립적인 기술 검색 의도가 6개 있으면 6개를 주입한다. 다만 중복 검색어, 제품명만 있는 검색어, 너무 넓은 검색어는 제거한다.

## Search Must Not Happen When

명시적으로 검색하지 말라고 했거나, 로컬 파일이 유일한 진실인 작업이면 검색하지 않는다:

- `검색하지 마`
- `no web`
- `offline only`
- `local only`
- `이 파일만 보고`
- `repo 안에서만`
- 번역, 단순 문장 수정, 제공된 텍스트 요약
- 현재 로컬 명령 실행 결과만 묻는 요청

사용자의 명시적 no-web 지시는 항상 우선한다.

## Hook Output Contract

검색이 필요한 경우 hook은 JSON stdout으로 다음 형태를 반환한다:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[Search-First]\nBefore implementation, perform web search first.\nReason: this request is not trivial local/text work.\nSearch these first:\n1. Codex plugin skills official documentation\n2. Codex UserPromptSubmit hook additionalContext\nAfter searching, summarize the source evidence in 1-3 lines, then continue."
  }
}
```

검색이 필요 없으면 `{}`를 출력하고 exit 0 한다.

### Injected Context Requirements

`additionalContext`에는 반드시 들어간다:

- Search-First 라벨
- 검색이 필요한 이유
- 요청 안의 모든 기술적 검색 의도
- 파일 수정/구현 전에 검색하라는 지시
- 검색 근거를 1-3줄로 요약하라는 지시
- no-web/local-only 지시가 있으면 검색하지 말라는 예외 확인

예시:

```text
[Search-First]
This request is not trivial local/text work. Before implementation, search the web.

Search these technical questions first:
1. OpenAI Codex plugin skills documentation
2. Codex hooks UserPromptSubmit additionalContext
3. Codex skill SKILL.md frontmatter description

Prefer official OpenAI docs/help center and local installed examples. Summarize the evidence in 1-3 lines, then continue.
```

## Query Planning Rules

hook은 자연어 검색어를 생성한다. 검색 API를 호출하지 않는다.

검색어 개수는 고정하지 않는다. hook은 요청의 모든 독립적인 기술 검색 의도를 커버해야 한다. 검색어를 줄이는 기준은 "5개 이하"가 아니라 "중복인가, 너무 넓은가, 구현 판단에 불필요한가"다.

좋은 query pattern:

- `<product> official docs <feature>`
- `<framework> latest <concept> official docs`
- `<platform> plugin skills documentation`
- `<api> migration changelog <year>`
- Korean user phrase plus English official term:
  - `코덱스 플러그인 만드는 법 OpenAI Codex plugin skills`
  - `Codex UserPromptSubmit hook additionalContext`
  - `Codex skills plugin official docs`

나쁜 query pattern:

- 제품명만 검색: `React`, `Next.js`, `Codex`, `Stripe`
- 사용자의 전체 프롬프트를 그대로 검색
- private repo 이름이나 비밀값이 섞인 검색
- 구현 질문이 빠진 막연한 검색: `popup UI`, `auth`, `plugin`

Source priority that the injected prompt should request:

1. Official docs and help center
2. Official GitHub repositories or release notes
3. Maintainer docs
4. Reputable technical references
5. Blog posts only when official docs are missing or insufficient

## Privacy

hook은 검색어를 만들 때 사용자 프롬프트 전체를 그대로 넣지 않는다.

검색어에서 제거해야 하는 것:

- API keys
- tokens
- `.env` values
- private URLs with credentials
- emails and phone numbers unless essential and user-approved
- proprietary prompt text
- long pasted code

검색어에는 공개 가능한 기술 키워드만 남긴다.

## Plugin Shape

v1은 hook + skill plugin이다.

```text
search-first/
  .codex-plugin/
    plugin.json
  hooks.json
  scripts/
    install-user-hook.mjs
    search-first-chain-hook.mjs
    search-first-hook.mjs
    prompt-classifier.mjs
  skills/
    search-first/
      SKILL.md
      agents/
        openai.yaml
  tests/
    install-user-hook.test.mjs
    search-first-hook.test.mjs
    fixtures/
      codex-plugin.json
      local-only.json
      no-web.json
      react-popup.json
      nextjs-auth.json
  SPEC.md
```

금지:

- hook이 직접 웹 검색하기
- 검색 API key 요구하기
- 사용자 프롬프트 전문을 검색어로 보내기
- no-web/local-only 지시를 무시하기
- 검색 생략 조건을 넓게 해석하기

## Manifest Draft

```json
{
  "name": "search-first",
  "version": "0.1.0",
  "description": "Injects search-first guidance into Codex prompts through UserPromptSubmit hooks when a request is not trivial local/text work.",
  "keywords": ["codex", "hooks", "skills", "web-search", "developer-workflow"],
  "skills": "./skills/",
  "interface": {
    "displayName": "Search First",
    "shortDescription": "Injects search instructions before coding when fresh or unfamiliar facts may matter",
    "category": "Developer Tools",
    "capabilities": ["Read"]
  }
}
```

Implementation note:

- 정확한 plugin manifest 필드와 plugin-scoped hook 지원 방식은 구현 직전에 현재 Codex plugin 예제 또는 설치된 local plugin 구조로 재확인한다.
- hook event와 output shape는 현재 로컬 설치에서 확인한 `UserPromptSubmit` 및 `hookSpecificOutput.additionalContext` 패턴을 기준으로 한다.
- 현재 Codex CLI는 marketplace source 등록만으로 plugin-scoped hook을 `~/.codex/hooks.json`에 자동 병합하지 않을 수 있다. v1은 `scripts/install-user-hook.mjs`가 기존 `UserPromptSubmit` hook을 chain으로 보존하면서 Search-First hook을 신뢰된 command로 설치한다.

## hooks.json Draft

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/search-first-chain-hook.mjs --chain-commands-b64 <existing-hooks>"
          }
        ]
      }
    ]
  }
}
```

The chain hook runs `search-first-hook.mjs` first, then any previously configured `UserPromptSubmit` command, and joins their `additionalContext` values. This prevents Search-First from deleting existing local hook behavior such as OMX routing context.

## Skill Requirements

`skills/search-first/SKILL.md`는 hook이 주입한 컨텍스트를 실행하게 만드는 보조 계약이다.

Frontmatter:

```markdown
---
name: search-first
description: Use when Search-First hook context is present, or before development/implementation/debugging/architecture/plugin/SDK/API/framework work where the request is not trivial local/text work. Follow injected search terms and perform web search before editing or making technical claims.
---
```

Body requirements:

```markdown
# Search First

If the prompt contains `[Search-First]` injected context, obey it before implementation.

Do not treat the hook as having already searched. The hook only suggested search terms. You must perform the actual web search.

Workflow:

1. Read the injected Search-First context.
2. If the user explicitly says no-web/local-only, do not search.
3. Otherwise search the suggested terms before editing files or making technical claims.
4. Prefer official docs/help center and local installed examples.
5. Summarize evidence in 1-3 lines.
6. Continue with repo inspection, implementation, and verification.
```

## Acceptance Criteria

Functional:

- `UserPromptSubmit` hook receives prompt JSON from stdin and exits 0.
- hook returns `{}` for no-web/local-only/trivial tasks.
- hook returns `hookSpecificOutput.additionalContext` for non-trivial development/technical tasks.
- injected context covers every distinct technical search intent in the prompt, without an arbitrary max count.
- injected context tells Codex to search before implementation.
- hook does not perform web search itself.
- hook does not require external API keys.
- hook redacts secrets and avoids full prompt query leakage.

Behavioral:

- Prompt: `코덱스 플러그인 만들거임. SPEC 만들자.`
  - Expected injected searches include Codex plugin, Codex skills, and Codex hook/UserPromptSubmit.
- Prompt: `Next.js 최신 방식으로 구현해줘.`
  - Expected injected searches include Next.js official docs and current app/router guidance.
- Prompt: `React로 접근성 좋은 팝업 UI 만들어줘.`
  - Expected injected searches are about accessible React modal/dialog implementation, focus trap, ARIA/dialog practices, not "what is React".
- Prompt: `Next.js 앱에 Supabase auth 붙이고 Vercel에 배포되게 해줘.`
  - Expected injected searches cover Next.js Supabase auth integration and Vercel deployment/env behavior. It must not collapse the request into one generic `Next.js` or `Supabase` search.
- Prompt: `검색하지 말고 SPEC.md만 요약해줘.`
  - Expected output is `{}`.
- Prompt: `이 문장 영어로 번역해줘: 안녕하세요`
  - Expected output is `{}`.

Quality:

- classifier is deterministic and testable.
- no external runtime dependency beyond Node.js.
- normal hook execution target: under 300 ms.
- malformed stdin returns safe no-op or safe diagnostic JSON without breaking Codex.

## Verification Plan

Automated:

```bash
node --test tests/search-first-hook.test.mjs
node scripts/search-first-hook.mjs < tests/fixtures/codex-plugin.json
node scripts/search-first-hook.mjs < tests/fixtures/local-only.json
node scripts/search-first-hook.mjs < tests/fixtures/no-web.json
node scripts/search-first-hook.mjs < tests/fixtures/react-popup.json
node scripts/search-first-hook.mjs < tests/fixtures/nextjs-auth.json
```

### Required Test Cases

The implementation is not complete unless all of these pass:

| Case | Prompt | Expected |
| --- | --- | --- |
| Codex plugin | `코덱스 플러그인 만들거임. SPEC 만들자.` | inject Search-First context for Codex plugin, skills, hook/UserPromptSubmit |
| React popup | `React로 접근성 좋은 팝업 UI 만들어줘.` | inject searches about React accessible modal/dialog implementation, not `React` definition |
| Next/Supabase/Vercel | `Next.js 앱에 Supabase auth 붙이고 Vercel에 배포되게 해줘.` | inject separate searches for Next.js auth integration, Supabase auth docs, Vercel deployment/env behavior |
| Migration | `Stripe subscription migration 해줘.` | inject Stripe billing/subscription migration and changelog/API docs searches |
| No web | `검색하지 말고 SPEC.md만 요약해줘.` | output `{}` |
| Local only | `repo 안에서 Button 컴포넌트 위치만 찾아줘.` | output `{}` |
| Provided text | `이 문장 영어로 번역해줘: 안녕하세요.` | output `{}` |
| Mechanical edit | `README에서 오타만 고쳐줘.` | output `{}` unless README content requires external facts |

### Terminal Codex Integration Test

성공 기준은 hook unit test만으로 끝나지 않는다. 완성 후 반드시 별도의 터미널 Codex 세션을 새로 호출해서 실제 주입이 되는지 확인한다.

Required integration flow:

1. Build the plugin locally.
2. Install or link the plugin into Codex so the hook is active.
   - `codex plugin marketplace add "$(pwd)"`
   - `node scripts/install-user-hook.mjs`
3. From a clean temporary test workspace, launch a separate Codex session from the terminal.
   - Use top-level `--search`: `codex --search exec --cd "$TMPDIR" "<prompt>"`
   - Do not use `codex exec --search`; current Codex CLI rejects that ordering.
4. Submit a prompt that should trigger search:
   - `코덱스 플러그인 만들거임. 간단한 README 작성해줘.`
5. Verify the new Codex session receives `[Search-First]` injected context.
6. Verify Codex performs web search before editing or answering.
7. Submit a no-web prompt:
   - `검색하지 말고 현재 README.md만 요약해줘.`
8. Verify no `[Search-First]` context is injected.

For deterministic test evidence, the installer may be run with:

```bash
node scripts/install-user-hook.mjs --diagnostic-log "$TMPDIR/search-first-hook.jsonl"
```

The diagnostic log is only for smoke tests. Normal installation should run without `--diagnostic-log`.

The final report must include:

- exact terminal command used to launch Codex
- where the plugin was installed or linked
- evidence that `[Search-First]` appeared for the trigger prompt
- evidence that no injection happened for the no-web prompt
- whether Codex actually searched before proceeding

If the terminal Codex integration test cannot be run, the implementation is incomplete.

### Manual App/CLI Verification

1. Install plugin locally.
2. Start a new Codex task.
3. Prompt: `코덱스 플러그인 만들거임. SPEC 만들자.`
4. Confirm Search-First context is injected.
5. Confirm Codex searches before editing.
6. Prompt: `검색하지 말고 현재 SPEC.md만 요약해줘.`
7. Confirm no Search-First context is injected.

## Distribution Goal

The deliverable is not just local code. When implementation is complete and verified, publish it as an installable GitHub repository:

- Repository name: `search-first-codex`
- Expected GitHub path: `/search-first-codex`
- Include all plugin files needed for direct install.
- Include a `README.md` with installation instructions.
- Include a short verification section showing the terminal Codex integration test.
- Include a release-ready repository layout, not a one-off workspace dump.

Required publish flow:

```bash
git init
git add .
git commit -m "<Lore protocol commit message>"
gh repo create search-first-codex --public --source=. --remote=origin --push
```

If `gh` is unavailable or authentication is missing, the final report must mark GitHub publishing as INCOMPLETE and explain the blocker. The plugin is not considered fully successful until it is available from GitHub and can be installed by another user.

## Expected Final Result

`/goal` 실행이 성공하면 결과값은 "문서만 있음"이 아니라 바로 설치 가능한 GitHub plugin repository여야 한다.

최종 산출물:

- local workspace에 완성된 `search-first` Codex plugin directory
- `.codex-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `hooks.json`
- `scripts/install-user-hook.mjs`
- `scripts/search-first-chain-hook.mjs`
- `scripts/search-first-hook.mjs`
- `scripts/prompt-classifier.mjs`
- `skills/search-first/SKILL.md`
- `skills/search-first/agents/openai.yaml`
- `tests/install-user-hook.test.mjs`
- `tests/search-first-hook.test.mjs`
- required fixtures:
  - `tests/fixtures/codex-plugin.json`
  - `tests/fixtures/local-only.json`
  - `tests/fixtures/no-web.json`
  - `tests/fixtures/react-popup.json`
  - `tests/fixtures/nextjs-auth.json`
- `README.md` with install instructions
- `SPEC.md`
- committed git history using the Lore commit protocol
- public GitHub repository: `search-first-codex`
- final report with exact verification evidence

최종 사용자가 기대하는 결과:

1. GitHub에서 `search-first-codex`를 받을 수 있다.
2. README의 설치 명령만 따라 하면 Codex에 plugin/hook/skill이 설치된다.
3. 새 Codex 세션에서 개발성 프롬프트를 입력하면 `[Search-First]` 컨텍스트가 자동 주입된다.
4. Codex가 구현 전에 주입된 검색 주제를 웹 검색한다.
5. `검색하지 마`, `local only`, 제공 텍스트 번역 같은 예외에서는 아무 것도 주입되지 않는다.

## Goal Execution Route

`/goal`을 실행하면 agent는 아래 순서로 완료까지 간다. 중간에 멈춰서 "진행할까요?"라고 묻지 않는다. 단, GitHub 인증, 파괴적 작업, 외부 권한 부족처럼 실제로 막힌 경우만 INCOMPLETE로 보고한다.

1. **Confirm current hook/plugin surface**
   - 현재 로컬 Codex hook 예제와 `UserPromptSubmit` stdin/output shape를 확인한다.
   - `hookSpecificOutput.additionalContext`가 현재 환경에서 맞는지 재검증한다.
2. **Create plugin skeleton**
   - plugin repository layout을 만든다.
   - manifest, hook config, skill, README, test fixtures를 생성한다.
3. **Implement classifier**
   - no-web/local-only/trivial work는 `{}`로 분류한다.
   - non-trivial technical/development prompts는 Search-First injection으로 분류한다.
   - 제품명 자체가 아니라 구현 의도를 검색어로 만든다.
4. **Implement UserPromptSubmit hook**
   - stdin JSON에서 prompt를 추출한다.
   - classifier 결과가 skip이면 `{}` 출력.
   - inject면 `hookSpecificOutput.additionalContext` 출력.
   - malformed stdin은 Codex 세션을 깨지 않게 안전 처리한다.
5. **Implement skill**
   - `[Search-First]` context가 있으면 실제 웹 검색을 먼저 하라고 지시한다.
   - hook이 검색한 것으로 착각하지 말라고 명시한다.
6. **Write tests**
   - required test cases를 모두 fixture로 만든다.
   - React popup 같은 경우 `React` 정의 검색이 아니라 popup/modal 구현 검색인지 assert한다.
7. **Run automated verification**
   - `node --test tests/search-first-hook.test.mjs`
   - fixture별 direct hook simulation
8. **Install/link plugin locally**
   - Codex가 실제로 hook을 읽을 수 있는 위치에 plugin을 설치하거나 링크한다.
   - marketplace 등록 후 `scripts/install-user-hook.mjs`로 `~/.codex/hooks.json` 및 `~/.codex/config.toml` trust state를 갱신한다.
   - 기존 `UserPromptSubmit` hook은 chain hook 안에서 보존한다.
   - README에 같은 설치 방법을 기록한다.
9. **Run terminal Codex integration test**
   - 별도의 새 터미널 Codex 세션을 실행한다.
   - trigger prompt에서 `[Search-First]` 주입과 실제 web search 선행을 확인한다.
   - no-web prompt에서 주입이 없는지 확인한다.
10. **Prepare distribution**
    - README 설치/검증 절차를 최종 정리한다.
    - git status를 확인하고 필요한 파일만 포함한다.
11. **Commit**
    - Lore commit protocol로 커밋한다.
12. **Publish GitHub repo**
    - `search-first-codex` public repo를 만들고 push한다.
13. **Final report**
    - changed files
    - test command outputs summary
    - terminal Codex integration evidence
    - GitHub URL
    - install command
    - remaining gaps, if any

## Done / Not Done Gate

`/goal`은 아래가 모두 참일 때만 complete다:

- all required files exist
- automated tests pass
- hook fixture simulations pass
- separate terminal Codex integration test passes
- trigger prompt injects `[Search-First]`
- no-web/local-only prompt does not inject
- Codex performs web search before implementation when injected
- GitHub repo `search-first-codex` exists and is pushed
- README lets another user install and test the plugin

아래 중 하나라도 실패하면 final status는 `INCOMPLETE`다:

- terminal Codex integration test를 못 돌림
- GitHub repo 생성/push 실패
- hook은 동작하지만 Codex가 실제로 주입 컨텍스트를 읽지 않음
- no-web/local-only 예외에서 Search-First가 주입됨
- 다른 사용자가 설치할 수 있는 README/배포 구조가 없음

## Open Questions

- Does the target Codex plugin installer load plugin-scoped `hooks.json`, or must the plugin install/merge hook config into user/workspace Codex hook config?
- What is the exact prompt field name in the `UserPromptSubmit` stdin payload across Codex App, CLI, and plugin surfaces?
- Should the hook output `hookEventName` in `hookSpecificOutput`, or only `additionalContext`?
- Should plugin installation include a status command to verify hook registration?

## Copy-Ready Development Goal

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
