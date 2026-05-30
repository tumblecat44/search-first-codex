import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const installerPath = new URL("../scripts/install-user-hook.mjs", import.meta.url).pathname;

test("installer preserves existing hooks and adds trusted Search-First UserPromptSubmit hook", () => {
  const codexHome = mkdtempSync(join(tmpdir(), "search-first-codex-home-"));
  const hooksPath = join(codexHome, "hooks.json");

  writeFileSync(
    hooksPath,
    `${JSON.stringify(
      {
        state: {
          "existing:key": { trusted_hash: "sha256:existing" },
        },
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: "command", command: "\"node\" \"/existing/hook.js\"" }],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );

  execFileSync(process.execPath, [installerPath], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });

  const installed = JSON.parse(readFileSync(hooksPath, "utf8"));
  const toml = readFileSync(join(codexHome, "config.toml"), "utf8");
  const entries = installed.hooks.UserPromptSubmit;

  assert.equal(entries.length, 1);
  assert.match(entries[0].hooks[0].command, /search-first-chain-hook\.mjs/);
  assert.match(entries[0].hooks[0].command, /--chain-commands-b64/);
  assert.equal(installed.state["existing:key"].trusted_hash, "sha256:existing");
  assert.match(
    installed.state[`${hooksPath}:user_prompt_submit:0:0`].trusted_hash,
    /^sha256:[a-f0-9]{64}$/,
  );
  assert.match(toml, /\[hooks\.state\."/);
  assert.match(toml, /trusted_hash = "sha256:/);
});

test("installer is idempotent for Search-First hook entries", () => {
  const codexHome = mkdtempSync(join(tmpdir(), "search-first-codex-home-"));
  const env = { ...process.env, CODEX_HOME: codexHome };

  execFileSync(process.execPath, [installerPath], { encoding: "utf8", env });
  execFileSync(process.execPath, [installerPath], { encoding: "utf8", env });

  const installed = JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"));
  const entries = installed.hooks.UserPromptSubmit;

  assert.equal(entries.length, 1);
  assert.match(entries[0].hooks[0].command, /search-first-chain-hook\.mjs/);
});

test("installer can embed a diagnostic log path for smoke testing", () => {
  const codexHome = mkdtempSync(join(tmpdir(), "search-first-codex-home-"));
  const logPath = join(codexHome, "hook.jsonl");

  execFileSync(process.execPath, [installerPath, "--diagnostic-log", logPath], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: codexHome },
  });

  const installed = JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"));
  const command = installed.hooks.UserPromptSubmit[0].hooks[0].command;

  assert.match(command, /--diagnostic-log/);
  assert.match(command, /hook\.jsonl/);
  assert.match(installed.state[`${join(codexHome, "hooks.json")}:user_prompt_submit:0:0`].trusted_hash, /^sha256:/);
});
