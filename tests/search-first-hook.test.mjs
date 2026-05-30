import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAdditionalContext, classifyPrompt, extractPrompt } from "../scripts/prompt-classifier.mjs";

const hookPath = new URL("../scripts/search-first-hook.mjs", import.meta.url).pathname;

function tempWikiPath() {
  return join(mkdtempSync(join(tmpdir(), "search-first-test-wiki-")), "wiki.json");
}

function runHook(fixture, options = {}) {
  const input = readFileSync(new URL(`fixtures/${fixture}`, import.meta.url), "utf8");
  const stdout = execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      SEARCH_FIRST_WIKI_PATH: options.wikiPath ?? tempWikiPath(),
    },
  });
  return JSON.parse(stdout);
}

function contextOf(output) {
  return output?.hookSpecificOutput?.additionalContext ?? "";
}

test("extracts prompt from common UserPromptSubmit payload shapes", () => {
  assert.equal(extractPrompt({ prompt: "hello" }), "hello");
  assert.equal(extractPrompt({ user_prompt: "hello" }), "hello");
  assert.equal(extractPrompt({ params: { prompt: "nested" } }), "nested");
  assert.equal(extractPrompt({ messages: [{ role: "user", content: "from messages" }] }), "from messages");
});

test("injects Codex plugin, skills, and hook searches", () => {
  const output = runHook("codex-plugin.json");
  const context = contextOf(output);

  assert.match(context, /\[Knowledge-First\]/);
  assert.match(context, /OpenAI Codex plugin skills documentation/);
  assert.match(context, /Codex plugin hooks UserPromptSubmit additionalContext/);
  assert.match(context, /Codex skill SKILL\.md frontmatter description/);
});

test("always injects hook context for no-web prompt without requiring web search", () => {
  const context = contextOf(runHook("no-web.json"));

  assert.match(context, /\[Knowledge-First\]/);
  assert.match(context, /Decision: no web search required/);
  assert.match(context, /explicit no-web\/local-only instruction/);
});

test("always injects hook context for local-only repo lookup without requiring web search", () => {
  const context = contextOf(runHook("local-only.json"));

  assert.match(context, /\[Knowledge-First\]/);
  assert.match(context, /Decision: no web search required/);
  assert.match(context, /trivial local\/text work/);
});

test("skips discussion-only technical questions without freshness or reference intent", () => {
  const result = classifyPrompt("AGENTS.md로 해결할 수 있는데 hook으로 만든 이유가 뭐지?");

  assert.equal(result.decision, "skip");
  assert.match(result.reason, /technical discussion/);
  assert.deepEqual(result.queries, []);
});

test("keeps official-reference technical questions searchable", () => {
  const result = classifyPrompt("Codex UserPromptSubmit hook 공식문서 기준 사용법 알려줘.");

  assert.equal(result.decision, "inject");
  assert.match(result.queries.join("\n"), /Codex UserPromptSubmit hook additionalContext/);
});

test("hook context is still injected for discussion-only technical questions", () => {
  const input = JSON.stringify({ prompt: "AGENTS.md로 해결할 수 있는데 hook으로 만든 이유가 뭐지?" });
  const stdout = execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: { ...process.env, SEARCH_FIRST_WIKI_PATH: tempWikiPath() },
  });
  const context = contextOf(JSON.parse(stdout));

  assert.match(context, /\[Knowledge-First\]/);
  assert.match(context, /Decision: no web search required/);
  assert.match(context, /technical discussion without implementation/);
});

test("passive hook decisions are logged as injected without web search", () => {
  const input = readFileSync(new URL("fixtures/no-web.json", import.meta.url), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "search-first-hook-"));
  const logPath = join(dir, "hook.jsonl");

  execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: { ...process.env, SEARCH_FIRST_HOOK_LOG: logPath, SEARCH_FIRST_WIKI_PATH: tempWikiPath() },
  });

  const [line] = readFileSync(logPath, "utf8").trim().split("\n");
  const entry = JSON.parse(line);

  assert.equal(entry.decision, "skip");
  assert.equal(entry.hookInjected, true);
  assert.equal(entry.requiresWebSearch, false);
});

test("React popup prompt searches implementation intent, not definition", () => {
  const output = runHook("react-popup.json");
  const context = contextOf(output);

  assert.match(context, /React accessible modal dialog official docs/);
  assert.match(context, /React popup modal focus trap aria dialog current best practices/);
  assert.doesNotMatch(context, /\n\d+\. React\n/);
});

test("Next Supabase Vercel prompt covers distinct integration intents", () => {
  const output = runHook("nextjs-auth.json");
  const context = contextOf(output);

  assert.match(context, /Supabase auth JavaScript current docs/);
  assert.match(context, /Supabase auth SSR Next\.js official docs/);
  assert.match(context, /Vercel environment variables deployment official docs/);
  assert.match(context, /Vercel Next\.js deployment official docs/);
  assert.doesNotMatch(context, /\n\d+\. Next\.js\n/);
  assert.doesNotMatch(context, /\n\d+\. Supabase\n/);
});

test("Gemini Flash chatbot prompt triggers official API searches", () => {
  const output = runHook("gemini-flash.json");
  const context = contextOf(output);

  assert.match(context, /Gemini API JavaScript SDK generateContent official docs/);
  assert.match(context, /Gemini API Flash model name official docs/);
  assert.doesNotMatch(context, /\n\d+\. Gemini\n/);
});

test("malformed stdin returns diagnostic JSON without throwing", () => {
  const stdout = execFileSync(process.execPath, [hookPath], { input: "{", encoding: "utf8" });
  const output = JSON.parse(stdout);
  assert.match(contextOf(output), /could not parse/);
});

test("additionalContext is generated from classifier result", () => {
  const result = classifyPrompt("Stripe subscription migration 해줘.");
  assert.equal(result.decision, "inject");
  const context = buildAdditionalContext(result);
  assert.match(context, /Stripe subscription migration latest API docs/);
  assert.match(context, /No useful personal Knowledge Wiki entries were found/);
});

test("injects Knowledge Wiki results before web fallback when a local hit exists", () => {
  const wikiPath = tempWikiPath();
  writeFileSync(
    wikiPath,
    `${JSON.stringify(
      {
        version: 1,
        entries: [
          {
            id: "react-modal-accessibility-test",
            title: "React modal accessibility",
            query: "React accessible modal dialog official docs",
            summary: "Use ARIA dialog semantics and restore focus after close.",
            content: "",
            tags: ["react", "a11y"],
            sources: [{ title: "Local note", url: "https://example.com/react-modal", note: "Saved reference" }],
            createdAt: "2026-05-30T00:00:00.000Z",
            updatedAt: "2026-05-30T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const output = runHook("react-popup.json", { wikiPath });
  const context = contextOf(output);

  assert.match(context, /\[Knowledge-First\]/);
  assert.match(context, /React modal accessibility/);
  assert.match(context, /No web search is required before implementation/);
  assert.match(context, /Perform web search only if the wiki entries are missing key details/);
  assert.doesNotMatch(context, /Before implementation, perform web search first/);
});

test("keeps web fallback when a Wiki hit is freshness-sensitive", () => {
  const wikiPath = tempWikiPath();
  writeFileSync(
    wikiPath,
    `${JSON.stringify(
      {
        version: 1,
        entries: [
          {
            id: "nextjs-app-router-test",
            title: "Next.js app router",
            query: "Next.js latest app router official docs",
            summary: "Saved local note about App Router.",
            content: "",
            tags: ["nextjs"],
            sources: [],
            createdAt: "2026-05-30T00:00:00.000Z",
            updatedAt: "2026-05-30T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const input = JSON.stringify({ prompt: "Next.js 최신 방식으로 app router 구현해줘." });
  const stdout = execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: { ...process.env, SEARCH_FIRST_WIKI_PATH: wikiPath },
  });
  const context = contextOf(JSON.parse(stdout));

  assert.match(context, /Next\.js app router/);
  assert.match(context, /freshness-sensitive/);
  assert.match(context, /Search these technical questions after reading the wiki/);
});

test("diagnostic log records hook decisions when enabled", () => {
  const input = readFileSync(new URL("fixtures/react-popup.json", import.meta.url), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "search-first-hook-"));
  const logPath = join(dir, "hook.jsonl");

  execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: { ...process.env, SEARCH_FIRST_HOOK_LOG: logPath, SEARCH_FIRST_WIKI_PATH: tempWikiPath() },
  });

  const [line] = readFileSync(logPath, "utf8").trim().split("\n");
  const entry = JSON.parse(line);

  assert.equal(entry.decision, "inject");
  assert.equal(entry.queryCount, 2);
  assert.equal(entry.wikiResultCount, 0);
  assert.equal(entry.hookInjected, true);
  assert.equal(entry.requiresWebSearch, true);
  assert.deepEqual(entry.queries, [
    "React accessible modal dialog official docs",
    "React popup modal focus trap aria dialog current best practices",
  ]);
});
