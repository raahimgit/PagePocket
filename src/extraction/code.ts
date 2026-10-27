import type { CodeBlock } from "../shared/types";
import { clip, isBoilerplate } from "./dom";
import { nearestHeading } from "./headings";

const MAX_BLOCKS = 100;
const MAX_CHARS = 50_000;
const LINE_NUMBER_NODES = ".linenos, .lineno, .line-numbers-rows, .hljs-ln-numbers, [data-line-number]";

const NON_LANGUAGES = new Set(["default", "none", "text", "plaintext", "nohighlight", "notranslate"]);

const ALIASES: Record<string, string> = {
  js: "javascript", mjs: "javascript", ts: "typescript", py: "python", rb: "ruby",
  sh: "shell", bash: "shell", zsh: "shell", console: "shell", yml: "yaml",
  "c++": "cpp", "c#": "csharp", cs: "csharp", golang: "go", rs: "rust", md: "markdown",
  psql: "sql", postgresql: "sql", pgsql: "sql",
};

const CLASS_PATTERNS = [
  /(?:^|\s)language-([\w+#.-]+)/,
  /(?:^|\s)lang-([\w+#.-]+)/,
  /(?:^|\s)highlight-source-([\w+#.-]+)/,
  /(?:^|\s)highlight-([\w+#.-]+)/,
  /(?:^|\s)brush:\s*([\w+#.-]+)/,
];

function fromClassName(className: string): string | undefined {
  for (const pattern of CLASS_PATTERNS) {
    const match = pattern.exec(className);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function normalizeLanguage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (NON_LANGUAGES.has(lower)) return undefined;
  return ALIASES[lower] ?? lower;
}

// Highlighters put the language on the <code>, the <pre>, or a wrapper
// (GitHub: div.highlight-source-js, Sphinx: div.highlight-python).
export function detectLanguage(pre: Element): string | undefined {
  const code = pre.querySelector("code");
  const candidates: (Element | null)[] = [code, pre, pre.parentElement, pre.parentElement?.parentElement ?? null];
  for (const el of candidates) {
    if (!el) continue;
    const attr = el.getAttribute("data-lang") ?? el.getAttribute("data-language");
    const language = normalizeLanguage(attr ?? fromClassName(el.getAttribute("class") ?? ""));
    if (language) return language;
  }
  return undefined;
}

// Docusaurus and similar renderers end every line with <br>, which textContent
// drops, collapsing the block onto one line.
function blockText(pre: Element): string {
  const source = pre.querySelector("code") ?? pre;
  if (!source.querySelector(LINE_NUMBER_NODES) && !source.querySelector("br")) return source.textContent ?? "";
  const clone = source.cloneNode(true) as Element;
  clone.querySelectorAll(LINE_NUMBER_NODES).forEach((n) => n.remove());
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return clone.textContent ?? "";
}

export function extractCodeBlocks(root: ParentNode, headings: Element[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const pre of root.querySelectorAll("pre")) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (isBoilerplate(pre)) continue;
    const text = blockText(pre).replace(/^\s*\n/, "").replace(/\s+$/, "");
    if (!text.trim()) continue;
    const { text: content, truncated } = clip(text, MAX_CHARS);
    blocks.push({
      content,
      language: detectLanguage(pre),
      headingContext: nearestHeading(pre, headings),
      ...(truncated ? { truncated } : {}),
    });
  }
  return blocks;
}
