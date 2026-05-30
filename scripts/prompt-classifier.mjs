const NO_WEB_PATTERNS = [
  /검색\s*하지\s*마/i,
  /검색하지\s*말/i,
  /\bno\s+web\b/i,
  /\boffline\s+only\b/i,
  /\blocal\s+only\b/i,
  /이\s*파일만\s*보고/i,
  /repo\s*안에서만/i,
  /레포\s*안에서만/i,
];

const TRIVIAL_PATTERNS = [
  { id: "provided-text-translation", pattern: /(번역|translate).{0,30}(:|：|\n|아래|문장)/i },
  { id: "provided-text-style", pattern: /(문장|텍스트).{0,30}(자연스럽게|다듬|톤|맞춤법|포맷|format)/i },
  { id: "specific-file-only", pattern: /(\S+\.(md|txt|json|ts|tsx|js|jsx|py|yaml|yml)).{0,30}(만\s*보고|요약|정리|설명|TODO만|찾아)/i },
  { id: "repo-local-lookup", pattern: /(repo|레포).{0,20}(안에서|내에서).{0,40}(위치|어디|찾아|find)/i },
  { id: "component-location", pattern: /(컴포넌트|component|route|파일|함수).{0,30}(어디|위치|찾아)/i },
  { id: "mechanical-edit", pattern: /(오타만|typo만|제목을?\s*바꿔|문구만\s*바꿔|import\s*정렬|markdown\s*정리|dead text\s*제거)/i },
  { id: "command-output", pattern: /(결과|output|로그|test output).{0,30}(무슨\s*뜻|설명|알려줘|해석)/i },
  { id: "date-result", pattern: /\bdate\b.{0,20}(결과|알려줘|출력)/i },
];

const TECH_INTENT_HINTS = [
  /개발|구현|만들|제작|디버깅|리팩터|설계|architecture|SPEC|PRD|test plan/i,
  /plugin|플러그인|skill|hook|UserPromptSubmit|MCP|automation|extension|CLI/i,
  /API|SDK|framework|library|라이브러리|SaaS|platform|배포|deploy/i,
  /React|Next\.?js|Supabase|Vercel|Stripe|OpenAI|Codex|ChatGPT|Gemini|Prisma|Drizzle|Tailwind|Expo|Firebase/i,
  /최신|현재|요즘|current|latest|migration|마이그레이션|changelog|release|breaking/i,
  /만드는\s*법|사용법|설정법|공식문서|정책|가격|quota|rate limit/i,
  /auth|인증|로그인|popup|팝업|modal|dialog|middleware|subscription/i,
];

const FRESHNESS_PATTERNS = [
  /최신|현재|요즘|current|latest|recent|newest/i,
  /migration|마이그레이션|changelog|release|breaking/i,
  /정책|가격|pricing|quota|rate limit|deprecat/i,
  /공식문서|official docs|verify|확인/i,
];

const ACTION_INTENT_PATTERNS = [
  /구현|만들|작성|수정|고쳐|붙이|연결|설정|설치|배포|테스트|리팩터|마이그레이션/i,
  /\b(add|apply|build|configure|create|debug|deploy|fix|implement|install|integrate|migrate|refactor|replace|scaffold|set\s*up|test|update|write)\b/i,
];

const REFERENCE_INTENT_PATTERNS = [
  /사용법|설정법|만드는\s*법|공식문서|문서\s*기준|레퍼런스/i,
  /\b(docs?|documentation|reference|how\s+to|recommended|best\s+practice|guide)\b/i,
];

const DISCUSSION_ONLY_PATTERNS = [
  /왜|이유|궁금|장단점|좋은\s*선택|안\s*좋은|나쁜\s*선택|시각|관점|판단|의견|설명/i,
  /\b(why|explain|opinion|trade-?offs?|pros\s+and\s+cons|good\s+choice|bad\s+choice)\b/i,
];

function addUnique(items, value) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return;
  if (!items.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    items.push(normalized);
  }
}

function stripSecrets(text) {
  return String(text)
    .replace(/[A-Z0-9_]*(API|TOKEN|SECRET|KEY)[A-Z0-9_]*\s*=\s*["']?[^"'\s]+/gi, "$1_REDACTED")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-REDACTED")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email redacted")
    .replace(/https?:\/\/[^\s]*([?&](token|key|secret|password)=)[^\s&]+/gi, "url credentials redacted")
    .slice(0, 220);
}

export function extractPrompt(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const directFields = [
    "prompt",
    "user_prompt",
    "userPrompt",
    "message",
    "input",
    "text",
    "content",
  ];

  for (const field of directFields) {
    if (typeof payload[field] === "string" && payload[field].trim()) {
      return payload[field];
    }
  }

  if (payload.params && typeof payload.params === "object") {
    const nested = extractPrompt(payload.params);
    if (nested) return nested;
  }

  if (payload.request && typeof payload.request === "object") {
    const nested = extractPrompt(payload.request);
    if (nested) return nested;
  }

  if (Array.isArray(payload.messages)) {
    const lastUser = [...payload.messages].reverse().find((message) => {
      return message && typeof message === "object" && message.role === "user";
    });
    if (lastUser) return extractPrompt(lastUser);
  }

  return "";
}

function classifySkip(prompt) {
  for (const pattern of NO_WEB_PATTERNS) {
    if (pattern.test(prompt)) {
      return { skip: true, reason: "explicit no-web/local-only instruction" };
    }
  }

  for (const { id, pattern } of TRIVIAL_PATTERNS) {
    if (pattern.test(prompt)) {
      return { skip: true, reason: `trivial local/text work: ${id}` };
    }
  }

  return { skip: false, reason: "" };
}

function buildKnownQueries(prompt) {
  const queries = [];
  const text = prompt;

  if (/(Codex|코덱스|OpenAI).{0,80}(plugin|플러그인)|(?:plugin|플러그인).{0,80}(Codex|코덱스|OpenAI)/i.test(text)) {
    addUnique(queries, "OpenAI Codex plugin skills documentation");
    addUnique(queries, "Codex plugin hooks UserPromptSubmit additionalContext");
    addUnique(queries, "Codex skill SKILL.md frontmatter description");
  }

  if (/(UserPromptSubmit|additionalContext|hook|훅)/i.test(text) && /(Codex|코덱스|plugin|플러그인)/i.test(text)) {
    addUnique(queries, "Codex UserPromptSubmit hook additionalContext");
  }

  if (/React/i.test(text) && /(popup|팝업|modal|dialog|다이얼로그|모달)/i.test(text)) {
    addUnique(queries, "React accessible modal dialog official docs");
    addUnique(queries, "React popup modal focus trap aria dialog current best practices");
  }

  if (/Next\.?js/i.test(text) && /(최신|current|latest|app router|방식)/i.test(text)) {
    addUnique(queries, "Next.js latest app router official docs");
  }

  if (/Next\.?js/i.test(text) && /(auth|인증|로그인|middleware|미들웨어)/i.test(text)) {
    addUnique(queries, "Next.js middleware authentication official docs");
    addUnique(queries, "Next.js current middleware matcher cookies auth");
  }

  if (/Supabase/i.test(text) && /(auth|인증|로그인|SSR|Next\.?js)/i.test(text)) {
    addUnique(queries, "Supabase auth JavaScript current docs");
    addUnique(queries, "Supabase auth SSR Next.js official docs");
  }

  if (/Vercel/i.test(text) && /(deploy|배포|env|environment|환경변수|Next\.?js)/i.test(text)) {
    addUnique(queries, "Vercel environment variables deployment official docs");
    addUnique(queries, "Vercel Next.js deployment official docs");
  }

  if (/Stripe/i.test(text) && /(subscription|구독|billing|migration|마이그레이션)/i.test(text)) {
    addUnique(queries, "Stripe subscription migration latest API docs");
    addUnique(queries, "Stripe billing subscriptions migration changelog");
  }

  if (/Gemini/i.test(text) && /(chat|챗봇|generateContent|SDK|API|Flash|model|모델)/i.test(text)) {
    addUnique(queries, "Gemini API JavaScript SDK generateContent official docs");
    addUnique(queries, "Gemini API Flash model name official docs");
  }

  return queries;
}

function hasTechnicalIntent(prompt) {
  return TECH_INTENT_HINTS.some((pattern) => pattern.test(prompt));
}

function hasActionIntent(prompt) {
  return ACTION_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function hasReferenceIntent(prompt) {
  return REFERENCE_INTENT_PATTERNS.some((pattern) => pattern.test(prompt));
}

function isDiscussionOnly(prompt) {
  return DISCUSSION_ONLY_PATTERNS.some((pattern) => pattern.test(prompt));
}

function shouldRequireSearchEvidence(prompt) {
  return hasActionIntent(prompt) || hasReferenceIntent(prompt) || requiresFreshWebCheck(prompt);
}

function fallbackQuery(prompt) {
  const cleaned = stripSecrets(prompt)
    .replace(/[^\p{L}\p{N}\s.\-_/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "current official documentation for requested technical implementation";
  return `${cleaned} official docs current recommended implementation`;
}

export function knowledgeLookupQuery(promptInput) {
  return stripSecrets(promptInput)
    .replace(/[^\p{L}\p{N}\s.\-_/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function requiresFreshWebCheck(promptInput) {
  const prompt = String(promptInput || "");
  return FRESHNESS_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function classifyPrompt(promptInput) {
  const prompt = String(promptInput || "").trim();
  if (!prompt) {
    return { decision: "skip", reason: "empty prompt", queries: [] };
  }

  const skip = classifySkip(prompt);
  if (skip.skip) {
    return { decision: "skip", reason: skip.reason, queries: [] };
  }

  const needsSearchEvidence = shouldRequireSearchEvidence(prompt);

  if (!needsSearchEvidence && isDiscussionOnly(prompt)) {
    return {
      decision: "skip",
      reason: "technical discussion without implementation, reference, or freshness search need",
      queries: [],
    };
  }

  const queries = buildKnownQueries(prompt);

  if (!queries.length && hasTechnicalIntent(prompt) && needsSearchEvidence) {
    addUnique(queries, fallbackQuery(prompt));
  }

  if (!queries.length) {
    return { decision: "skip", reason: "no technical search intent detected", queries: [] };
  }

  return {
    decision: "inject",
    reason: "request is not trivial local/text work and includes technical implementation context",
    queries,
  };
}

function summarizeWikiEntry(entry, index) {
  const sources = Array.isArray(entry.sources)
    ? entry.sources
        .map((source) => source.title || source.url || source.note)
        .filter(Boolean)
        .slice(0, 2)
        .join(", ")
    : "";
  return [
    `${index + 1}. ${entry.title || entry.id || "Untitled knowledge"}`,
    entry.summary ? `   Summary: ${entry.summary}` : "",
    entry.tags?.length ? `   Tags: ${entry.tags.join(", ")}` : "",
    sources ? `   Sources: ${sources}` : "",
    entry.id ? `   Wiki ID: ${entry.id}` : "",
  ].filter(Boolean).join("\n");
}

export function buildKnowledgeFirstContext(result, wikiResults, options = {}) {
  const entries = Array.isArray(wikiResults) ? wikiResults.slice(0, 3) : [];
  const mustSearchWeb = Boolean(options.mustSearchWeb);
  const shouldCheckWeb = mustSearchWeb || Boolean(options.requiresFreshWebCheck);
  const lines = [
    "[Knowledge-First]",
    "Before web search, use the matching personal Knowledge Wiki entries below.",
    `Reason: ${result.reason}.`,
    "",
    "Matching Knowledge Wiki entries:",
    ...entries.map(summarizeWikiEntry),
    "",
  ];

  if (shouldCheckWeb) {
    lines.push(
      mustSearchWeb
        ? "Classifier matched this as a technical implementation/reference task. Perform web search before implementation, even if the wiki has matching entries."
        : "This prompt appears freshness-sensitive, so also perform web search before implementation.",
      "Search these technical questions after reading the wiki:",
      ...result.queries.map((query, index) => `${index + 1}. ${query}`),
      "",
      "Compare web evidence against the wiki entries and update the wiki if the stored knowledge is stale.",
    );
  } else {
    lines.push(
      "No web search is required before implementation if these entries sufficiently answer the task.",
      "Perform web search only if the wiki entries are missing key details, lack sources, or conflict with the current request.",
    );
  }

  lines.push(
    "When web search produces reusable development knowledge, save it to the personal JSON wiki with scripts/knowledge-wiki.mjs.",
    "If the user explicitly asked for no-web/local-only work, do not search.",
  );

  return lines.join("\n");
}

export function buildAdditionalContext(result) {
  const lines = [
    "[Knowledge-First]",
    "No useful personal Knowledge Wiki entries were found. Perform web search before implementation.",
    `Reason: ${result.reason}.`,
    "",
    "Web fallback questions:",
    ...result.queries.map((query, index) => `${index + 1}. ${query}`),
    "",
    "Do not treat this hook as having already searched the web. Use the actual web search tool if the wiki has no useful match or freshness matters.",
    "Prefer official docs/help center, official repositories, release notes, and maintainer documentation.",
    "Summarize the source evidence in 1-3 lines, then continue with the original task.",
    "When the search produces reusable development knowledge, save it to the personal JSON wiki with scripts/knowledge-wiki.mjs.",
    "If the user explicitly asked for no-web/local-only work, do not search.",
  ];
  return lines.join("\n");
}

export function buildPassiveContext(result, wikiResults) {
  const entries = Array.isArray(wikiResults) ? wikiResults.slice(0, 3) : [];
  const lines = [
    "[Knowledge-First]",
    "Knowledge-First hook is active for this prompt.",
    `Decision: no web search required. Reason: ${result.reason}.`,
    "",
  ];

  if (entries.length) {
    lines.push(
      "Matching personal Knowledge Wiki entries:",
      ...entries.map(summarizeWikiEntry),
      "",
      "Use these entries only if they are relevant. Do not perform web search unless the user asks for it or the task later becomes freshness-sensitive.",
    );
  } else {
    lines.push("No matching personal Knowledge Wiki entries were found.");
  }

  lines.push("If the user explicitly asked for no-web/local-only work, do not search.");
  return lines.join("\n");
}
