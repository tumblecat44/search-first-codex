import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const wikiPath = new URL("../scripts/knowledge-wiki.mjs", import.meta.url).pathname;

function runWiki(args, options = {}) {
  return execFileSync(process.execPath, [wikiPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      SEARCH_FIRST_WIKI_PATH: options.storePath,
    },
    input: options.input,
  });
}

test("adds search knowledge to a JSON wiki store", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-first-wiki-"));
  const storePath = join(dir, "wiki.json");

  const output = runWiki(
    [
      "add",
      "--title",
      "React modal accessibility",
      "--query",
      "React accessible modal dialog official docs",
      "--summary",
      "Use ARIA dialog semantics and return focus after close.",
      "--tag",
      "react,a11y",
      "--source",
      "https://react.dev|React docs|Reference source",
    ],
    { storePath },
  );

  const result = JSON.parse(output);
  const store = JSON.parse(readFileSync(storePath, "utf8"));

  assert.equal(result.path, storePath);
  assert.equal(store.version, 1);
  assert.equal(store.entries.length, 1);
  assert.match(store.entries[0].id, /^react-modal-accessibility-/);
  assert.deepEqual(store.entries[0].tags, ["react", "a11y"]);
  assert.equal(store.entries[0].sources[0].url, "https://react.dev");
});

test("searches wiki entries with JSON output", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-first-wiki-"));
  const storePath = join(dir, "wiki.json");

  runWiki(
    [
      "add",
      "--title",
      "Supabase SSR auth",
      "--summary",
      "Cookie-backed SSR clients need request and response cookie handling.",
      "--tag",
      "supabase,nextjs",
    ],
    { storePath },
  );
  runWiki(
    [
      "add",
      "--title",
      "Stripe webhook body",
      "--summary",
      "Webhook signature verification needs the raw request body.",
      "--tag",
      "stripe",
    ],
    { storePath },
  );

  const output = runWiki(["search", "supabase auth", "--json"], { storePath });
  const result = JSON.parse(output);

  assert.equal(result.total, 1);
  assert.equal(result.results[0].title, "Supabase SSR auth");
  assert.ok(result.results[0].score > 0);
});

test("adds an entry from stdin JSON and upserts by stable id", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-first-wiki-"));
  const storePath = join(dir, "wiki.json");
  const input = JSON.stringify({
    title: "Codex hook additionalContext",
    query: "Codex UserPromptSubmit hook additionalContext",
    summary: "Hooks can inject developer context through additionalContext.",
    tags: ["codex", "hooks"],
  });

  const first = JSON.parse(runWiki(["add"], { storePath, input }));
  const second = JSON.parse(runWiki(["add", "--summary", "Updated summary."], { storePath, input }));
  const store = JSON.parse(readFileSync(storePath, "utf8"));

  assert.equal(first.entry.id, second.entry.id);
  assert.equal(store.entries.length, 1);
  assert.equal(store.entries[0].summary, "Updated summary.");
});

test("ignores generic official-doc tokens that cause unrelated Wiki hits", () => {
  const dir = mkdtempSync(join(tmpdir(), "search-first-wiki-"));
  const storePath = join(dir, "wiki.json");

  runWiki(
    [
      "add",
      "--title",
      "Codex AGENTS.md vs hooks",
      "--summary",
      "Use hooks for lifecycle-bound deterministic behavior.",
      "--tag",
      "codex,hooks,agents",
      "--source",
      "OpenAI Codex hooks guide|https://example.com|Official docs",
    ],
    { storePath },
  );

  const output = runWiki(["search", "Gemini API JavaScript SDK generateContent official docs", "--json"], { storePath });
  const result = JSON.parse(output);

  assert.equal(result.total, 0);
});
