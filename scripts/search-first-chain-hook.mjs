#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseJson(raw) {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function nextCommands() {
  const encoded = argValue("--chain-commands-b64") ?? process.env.SEARCH_FIRST_CHAIN_COMMANDS_B64;
  if (!encoded) {
    return [];
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function runNodeHook(scriptPath, input) {
  try {
    return execFileSync(process.execPath, [scriptPath], {
      input,
      encoding: "utf8",
      env: {
        ...process.env,
        ...(argValue("--diagnostic-log") ? { SEARCH_FIRST_HOOK_LOG: argValue("--diagnostic-log") } : {}),
      },
    });
  } catch (error) {
    return error?.stdout?.toString?.() ?? "";
  }
}

function runShellHook(command, input) {
  try {
    return execFileSync(command, {
      input,
      encoding: "utf8",
      env: process.env,
      shell: true,
    });
  } catch (error) {
    return error?.stdout?.toString?.() ?? "";
  }
}

function contextOf(output) {
  return output?.hookSpecificOutput?.additionalContext;
}

const input = readStdin();
const here = dirname(fileURLToPath(import.meta.url));
const outputs = [parseJson(runNodeHook(join(here, "search-first-hook.mjs"), input))];

for (const command of nextCommands()) {
  outputs.push(parseJson(runShellHook(command, input)));
}

const contexts = outputs.map(contextOf).filter((context) => typeof context === "string" && context.trim());

if (contexts.length === 0) {
  process.stdout.write("{}\n");
} else {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: contexts.join("\n\n"),
      },
    })}\n`,
  );
}
