#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAdditionalContext,
  buildKnowledgeFirstContext,
  buildPassiveContext,
  classifyPrompt,
  extractPrompt,
  knowledgeLookupQuery,
  requiresFreshWebCheck,
} from "./prompt-classifier.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeDiagnosticLog(entry) {
  const logPath = process.env.SEARCH_FIRST_HOOK_LOG;
  if (!logPath) {
    return;
  }

  appendFileSync(logPath, `${JSON.stringify({ ...entry, timestamp: new Date().toISOString() })}\n`);
}

function searchWiki(queries) {
  const query = queries.join(" ");
  if (!query.trim()) {
    return [];
  }

  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "knowledge-wiki.mjs");

  try {
    const stdout = execFileSync(process.execPath, [scriptPath, "search", query, "--json", "--limit", "3"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

const raw = readStdin();

try {
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const prompt = extractPrompt(payload);
  const result = classifyPrompt(prompt);

  if (result.decision !== "inject") {
    const wikiResults = searchWiki([knowledgeLookupQuery(prompt)]);
    writeDiagnosticLog({
      decision: result.decision,
      reason: result.reason,
      queryCount: 0,
      wikiResultCount: wikiResults.length,
      hookInjected: true,
      requiresWebSearch: false,
    });
    writeJson({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: buildPassiveContext(result, wikiResults),
      },
    });
    process.exit(0);
  }

  const wikiResults = searchWiki(result.queries);
  const freshWebCheck = requiresFreshWebCheck(prompt);

  writeDiagnosticLog({
    decision: result.decision,
    reason: result.reason,
    queryCount: result.queries.length,
    queries: result.queries,
    wikiResultCount: wikiResults.length,
    requiresFreshWebCheck: freshWebCheck,
    hookInjected: true,
    requiresWebSearch: true,
  });

  writeJson({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: wikiResults.length
        ? buildKnowledgeFirstContext(result, wikiResults, {
            requiresFreshWebCheck: freshWebCheck,
          })
        : buildAdditionalContext(result),
    },
  });
} catch (error) {
  writeDiagnosticLog({
    decision: "error",
    reason: error instanceof Error ? error.message : String(error),
    queryCount: 0,
  });

  writeJson({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: [
        "[Search-First]",
        "Search-First hook could not parse its stdin payload.",
        "Proceed without injected search guidance for this turn.",
        `Diagnostic: ${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    },
  });
}
