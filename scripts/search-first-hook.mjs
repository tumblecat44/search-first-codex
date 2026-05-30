#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { buildAdditionalContext, classifyPrompt, extractPrompt } from "./prompt-classifier.mjs";

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

const raw = readStdin();

try {
  const payload = raw.trim() ? JSON.parse(raw) : {};
  const prompt = extractPrompt(payload);
  const result = classifyPrompt(prompt);

  if (result.decision !== "inject") {
    writeDiagnosticLog({ decision: result.decision, reason: result.reason, queryCount: 0 });
    writeJson({});
    process.exit(0);
  }

  writeDiagnosticLog({
    decision: result.decision,
    reason: result.reason,
    queryCount: result.queries.length,
    queries: result.queries,
  });

  writeJson({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: buildAdditionalContext(result),
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
