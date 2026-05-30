import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAdditionalContext, classifyPrompt, extractPrompt } from "../scripts/prompt-classifier.mjs";

const hookPath = new URL("../scripts/search-first-hook.mjs", import.meta.url).pathname;

function runHook(fixture) {
  const input = readFileSync(new URL(`fixtures/${fixture}`, import.meta.url), "utf8");
  const stdout = execFileSync(process.execPath, [hookPath], { input, encoding: "utf8" });
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

  assert.match(context, /\[Search-First\]/);
  assert.match(context, /OpenAI Codex plugin skills documentation/);
  assert.match(context, /Codex plugin hooks UserPromptSubmit additionalContext/);
  assert.match(context, /Codex skill SKILL\.md frontmatter description/);
});

test("skips no-web prompt", () => {
  assert.deepEqual(runHook("no-web.json"), {});
});

test("skips local-only repo lookup prompt", () => {
  assert.deepEqual(runHook("local-only.json"), {});
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
  assert.match(context, /Do not treat this hook as having already searched/);
});

test("diagnostic log records hook decisions when enabled", () => {
  const input = readFileSync(new URL("fixtures/react-popup.json", import.meta.url), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "search-first-hook-"));
  const logPath = join(dir, "hook.jsonl");

  execFileSync(process.execPath, [hookPath], {
    input,
    encoding: "utf8",
    env: { ...process.env, SEARCH_FIRST_HOOK_LOG: logPath },
  });

  const [line] = readFileSync(logPath, "utf8").trim().split("\n");
  const entry = JSON.parse(line);

  assert.equal(entry.decision, "inject");
  assert.equal(entry.queryCount, 2);
  assert.deepEqual(entry.queries, [
    "React accessible modal dialog official docs",
    "React popup modal focus trap aria dialog current best practices",
  ]);
});
