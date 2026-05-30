#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVENT_NAME = "UserPromptSubmit";
const EVENT_LABEL = "user_prompt_submit";
const HOOK_MARKER = "search-first-hook.mjs";
const CHAIN_MARKER = "search-first-chain-hook.mjs";

function quoteCommandPart(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeTomlBasicString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function diagnosticLogPath() {
  const index = process.argv.indexOf("--diagnostic-log");
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  if (!value) {
    throw new Error("--diagnostic-log requires a path.");
  }

  return resolve(value);
}

function codexHome() {
  if (process.env.CODEX_HOME) {
    return resolve(process.env.CODEX_HOME);
  }

  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME is not set. Set CODEX_HOME to your Codex config directory.");
  }

  return join(home, ".codex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }

  return value;
}

function trustedHash(identity) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonicalJson(identity))).digest("hex")}`;
}

function commandIdentity(command) {
  return {
    event_name: EVENT_LABEL,
    hooks: [
      {
        async: false,
        command,
        timeout: 600,
        type: "command",
      },
    ],
  };
}

function decodeChainedCommands(command) {
  const match = command.match(/--chain-commands-b64\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
    ?? command.match(/SEARCH_FIRST_CHAIN_COMMANDS_B64=(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const encoded = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!encoded) {
    return [];
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function collectExistingCommands(entries) {
  const commands = [];

  for (const entry of entries) {
    const entryHooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
    for (const hook of entryHooks) {
      const hookCommand = String(hook?.command ?? "");
      if (!hookCommand) {
        continue;
      }

      if (hookCommand.includes(CHAIN_MARKER)) {
        commands.push(...decodeChainedCommands(hookCommand));
      } else if (!hookCommand.includes(HOOK_MARKER)) {
        commands.push(hookCommand);
      }
    }
  }

  return [...new Set(commands)];
}

function readHooksConfig(hooksPath) {
  if (!existsSync(hooksPath)) {
    return {};
  }

  const raw = readFileSync(hooksPath, "utf8");
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${hooksPath} must contain a JSON object.`);
  }

  return parsed;
}

function upsertTrustStateToml(configPath, key, hash) {
  const escapedKey = escapeTomlBasicString(key);
  const header = `[hooks.state."${escapedKey}"]`;
  const block = `${header}\ntrusted_hash = "${escapeTomlBasicString(hash)}"\n`;
  const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const lines = raw.split(/\n/);
  const start = lines.findIndex((line) => line.trim() === header);

  if (start === -1) {
    const trimmed = raw.trimEnd();
    writeFileSync(configPath, `${trimmed}${trimmed ? "\n\n" : ""}${block}`);
    return;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) {
    end += 1;
  }

  const next = [...lines.slice(0, start), ...block.trimEnd().split("\n"), ...lines.slice(end)].join("\n");
  writeFileSync(configPath, next.endsWith("\n") ? next : `${next}\n`);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hookScript = join(repoRoot, "scripts", CHAIN_MARKER);
const logPath = diagnosticLogPath();
const targetCodexHome = codexHome();
const hooksPath = join(targetCodexHome, "hooks.json");
const configPath = join(targetCodexHome, "config.toml");

mkdirSync(targetCodexHome, { recursive: true });

const config = readHooksConfig(hooksPath);
const hooks = config.hooks && typeof config.hooks === "object" && !Array.isArray(config.hooks) ? config.hooks : {};
const entries = Array.isArray(hooks[EVENT_NAME]) ? hooks[EVENT_NAME] : [];
const existingCommands = collectExistingCommands(entries);
const encodedExistingCommands = Buffer.from(JSON.stringify(existingCommands), "utf8").toString("base64");
const command = [
  quoteCommandPart(process.execPath),
  quoteCommandPart(hookScript),
  "--chain-commands-b64",
  quoteCommandPart(encodedExistingCommands),
  ...(logPath ? ["--diagnostic-log", quoteCommandPart(logPath)] : []),
].join(" ");

hooks[EVENT_NAME] = [
  {
    hooks: [
      {
        type: "command",
        command,
      },
    ],
  },
];
config.hooks = hooks;

const groupIndex = 0;
const handlerIndex = 0;
const state = config.state && typeof config.state === "object" && !Array.isArray(config.state) ? config.state : {};
const trustKey = `${hooksPath}:${EVENT_LABEL}:${groupIndex}:${handlerIndex}`;
const hash = trustedHash(commandIdentity(command));
state[trustKey] = {
  trusted_hash: hash,
};
config.state = state;

writeFileSync(hooksPath, `${JSON.stringify(config, null, 2)}\n`);
upsertTrustStateToml(configPath, trustKey, hash);
process.stdout.write(`Installed Search-First UserPromptSubmit hook in ${hooksPath}\n`);
