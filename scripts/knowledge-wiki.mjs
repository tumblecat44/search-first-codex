#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const STORE_VERSION = 1;
const MIN_SEARCH_SCORE = 2;
const SEARCH_STOP_WORDS = new Set([
  "official",
  "docs",
  "documentation",
  "current",
  "recommended",
  "implementation",
  "requested",
  "technical",
]);

function codexHome() {
  if (process.env.CODEX_HOME) {
    return resolve(process.env.CODEX_HOME);
  }

  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME is not set. Set CODEX_HOME or SEARCH_FIRST_WIKI_PATH.");
  }

  return join(home, ".codex");
}

function wikiPath() {
  if (process.env.SEARCH_FIRST_WIKI_PATH) {
    return resolve(process.env.SEARCH_FIRST_WIKI_PATH);
  }

  return join(codexHome(), "search-first", "wiki.json");
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split(/=(.*)/s);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    const argValue = inlineValue !== undefined
      ? inlineValue
      : next && !next.startsWith("--")
        ? argv[++index]
        : true;

    if (args[key] === undefined) {
      args[key] = argValue;
    } else if (Array.isArray(args[key])) {
      args[key].push(argValue);
    } else {
      args[key] = [args[key], argValue];
    }
  }

  return args;
}

function asArray(value) {
  if (value === undefined || value === null || value === true) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function splitCsv(values) {
  return asArray(values)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "entry";
}

function stableId(entry) {
  const base = entry.title || entry.query || entry.summary || entry.content || "entry";
  const hash = createHash("sha1")
    .update([entry.title, entry.query].filter(Boolean).join("\n") || String(entry.summary || entry.content || "entry"))
    .digest("hex")
    .slice(0, 10);
  return `${slugify(base)}-${hash}`;
}

function emptyStore() {
  return { version: STORE_VERSION, entries: [] };
}

function normalizeStore(store) {
  if (!store || typeof store !== "object" || Array.isArray(store)) {
    return emptyStore();
  }

  return {
    version: STORE_VERSION,
    entries: Array.isArray(store.entries) ? store.entries : [],
  };
}

function readStore(path) {
  if (!existsSync(path)) {
    return emptyStore();
  }

  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) {
    return emptyStore();
  }

  return normalizeStore(JSON.parse(raw));
}

function writeStore(path, store) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalizeStore(store), null, 2)}\n`);
  renameSync(tmp, path);
}

function parseSource(value) {
  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (text.startsWith("{")) {
    const parsed = JSON.parse(text);
    return normalizeSource(parsed);
  }

  const [urlOrTitle, title, note] = text.split("|").map((item) => item?.trim()).filter(Boolean);
  const source = /^https?:\/\//i.test(urlOrTitle)
    ? { url: urlOrTitle, title, note }
    : { title: urlOrTitle, url: title, note };
  return normalizeSource(source);
}

function normalizeSource(source) {
  if (!source || typeof source !== "object") {
    return null;
  }

  const normalized = {
    title: source.title ? String(source.title).trim() : "",
    url: source.url ? String(source.url).trim() : "",
    note: source.note ? String(source.note).trim() : "",
  };

  return normalized.title || normalized.url || normalized.note ? normalized : null;
}

function normalizeEntry(entry, now = new Date().toISOString()) {
  const tags = [...new Set(splitCsv(entry.tags).map((tag) => tag.toLowerCase()))];
  const sources = asArray(entry.sources).map(normalizeSource).filter(Boolean);

  return {
    id: entry.id ? String(entry.id).trim() : stableId(entry),
    title: String(entry.title || entry.query || "Untitled knowledge").trim(),
    query: entry.query ? String(entry.query).trim() : "",
    summary: entry.summary ? String(entry.summary).trim() : "",
    content: entry.content ? String(entry.content).trim() : "",
    tags,
    sources,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };
}

function entryFromArgs(args, stdin) {
  let base = {};
  const trimmedStdin = stdin.trim();

  if (trimmedStdin) {
    try {
      const parsed = JSON.parse(trimmedStdin);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        base = parsed;
      } else {
        base.content = trimmedStdin;
      }
    } catch {
      base.content = trimmedStdin;
    }
  }

  return {
    ...base,
    title: args.title ?? base.title,
    query: args.query ?? base.query,
    summary: args.summary ?? base.summary,
    content: args.content ?? base.content,
    tags: args.tag ?? args.tags ?? base.tags,
    sources: [
      ...asArray(base.sources),
      ...asArray(args.source).map(parseSource).filter(Boolean),
    ],
  };
}

function textBlob(entry) {
  return [
    entry.title,
    entry.query,
    entry.summary,
    entry.content,
    ...(entry.tags || []),
    ...(entry.sources || []).flatMap((source) => [source.title, source.url, source.note]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function tokenize(query) {
  return String(query)
    .toLowerCase()
    .split(/[^\p{L}\p{N}._/-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function scoreEntry(entry, query) {
  const tokens = tokenize(query);
  if (!tokens.length) {
    return 0;
  }

  const title = String(entry.title || "").toLowerCase();
  const tags = (entry.tags || []).join(" ").toLowerCase();
  const blob = textBlob(entry);

  return tokens.reduce((score, token) => {
    if (title.includes(token)) score += 5;
    if (tags.includes(token)) score += 3;
    if (blob.includes(token)) score += 1;
    return score;
  }, 0);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printTextEntry(entry) {
  process.stdout.write(`${entry.id}\n${entry.title}\n`);
  if (entry.summary) {
    process.stdout.write(`${entry.summary}\n`);
  }
}

function usage() {
  process.stdout.write(`Knowledge Wiki

Usage:
  node scripts/knowledge-wiki.mjs add --title <title> --summary <summary> [--query <query>] [--tag <tag>] [--source <url|title|note>]
  node scripts/knowledge-wiki.mjs search <query> [--limit 5] [--json]
  node scripts/knowledge-wiki.mjs get <id> [--json]
  node scripts/knowledge-wiki.mjs list [--json]
  node scripts/knowledge-wiki.mjs path

Store:
  ${wikiPath()}
`);
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const storePath = wikiPath();

try {
  if (!command || command === "help" || command === "--help") {
    usage();
    process.exit(0);
  }

  if (command === "path") {
    process.stdout.write(`${storePath}\n`);
    process.exit(0);
  }

  const store = readStore(storePath);

  if (command === "add") {
    const entry = normalizeEntry(entryFromArgs(args, readStdin()));
    if (!entry.summary && !entry.content) {
      throw new Error("add requires --summary, --content, or stdin content.");
    }

    const existingIndex = store.entries.findIndex((item) => item.id === entry.id);
    if (existingIndex === -1) {
      store.entries.unshift(entry);
    } else {
      store.entries[existingIndex] = {
        ...store.entries[existingIndex],
        ...entry,
        createdAt: store.entries[existingIndex].createdAt,
      };
    }

    writeStore(storePath, store);
    printJson({ path: storePath, entry });
    process.exit(0);
  }

  if (command === "search") {
    const query = args._.join(" ").trim();
    const limit = Number(args.limit ?? 10);
    const results = store.entries
      .map((entry) => ({ ...entry, score: scoreEntry(entry, query) }))
      .filter((entry) => entry.score >= MIN_SEARCH_SCORE)
      .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10);

    if (args.json) {
      printJson({ query, total: results.length, results });
    } else {
      results.forEach(printTextEntry);
    }
    process.exit(0);
  }

  if (command === "list") {
    const entries = [...store.entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (args.json) {
      printJson({ total: entries.length, entries });
    } else {
      entries.forEach(printTextEntry);
    }
    process.exit(0);
  }

  if (command === "get") {
    const id = args._[0];
    const entry = store.entries.find((item) => item.id === id);
    if (!entry) {
      throw new Error(`No wiki entry found for id: ${id}`);
    }

    if (args.json) {
      printJson(entry);
    } else {
      printTextEntry(entry);
      if (entry.content) {
        process.stdout.write(`\n${entry.content}\n`);
      }
    }
    process.exit(0);
  }

  throw new Error(`Unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
