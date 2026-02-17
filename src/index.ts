import { existsSync, readFileSync, statSync } from "node:fs";
import Cite from "citation-js";
import type { BadgeConfig, BibEntry, BibliographyOptions, FormatOptions } from "./types.js";

export type { BadgeConfig, BibEntry, BibliographyOptions, FormatOptions } from "./types.js";

// ---------------------------------------------------------------------------
// Bibliography class
// ---------------------------------------------------------------------------

export class Bibliography {
  /** The CSL template name to use for formatting. */
  readonly templateName: string;

  /** All parsed entries. */
  readonly entries: BibEntry[];

  private readonly customFieldNames: string[];

  constructor(options: BibliographyOptions) {
    const bibData = maybeReadFile(options.data);
    this.customFieldNames = options.customFields ?? [];

    // Register CSL style
    this.templateName = this.registerStyle(options.cslStyle);

    // Two-pass parse: raw (preserves all fields) + CSL (for formatting)
    const { plugins } = Cite;
    const rawEntries: { label: string; properties: Record<string, any> }[] =
      plugins.input.chainLink(bibData);
    const rawMap = new Map<string, Record<string, any>>();
    for (const entry of rawEntries) {
      rawMap.set(entry.label, entry.properties);
    }

    const cite = new Cite(bibData);
    this.entries = (cite.data as Record<string, any>[]).map(
      (csl): BibEntry => {
        const key = String(csl["citation-key"] || csl.id);
        const raw = rawMap.get(key) ?? {};
        const custom: Record<string, string> = {};
        for (const f of this.customFieldNames) {
          if (raw[f] != null) custom[f] = String(raw[f]);
        }
        return {
          csl,
          key,
          year: csl.issued?.["date-parts"]?.[0]?.[0] ?? null,
          custom,
          raw,
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Filtering & sorting
  // -------------------------------------------------------------------------

  /**
   * Return entries whose custom fields match **all** given key/value pairs.
   *
   * @example
   * bib.filter({ 'publication-status': 'published' })
   */
  filter(criteria: Record<string, string>): BibEntry[] {
    return this.entries.filter((e) =>
      Object.entries(criteria).every(([k, v]) => e.custom[k] === v),
    );
  }

  /**
   * Return a sorted **copy** of the given entries.
   *
   * @param entries - entries to sort (not mutated)
   * @param by - `'year'` (default) or a custom field name
   * @param order - `'desc'` (default) or `'asc'`
   */
  sort(
    entries: BibEntry[],
    { by = "year", order = "desc" }: { by?: string; order?: "asc" | "desc" } = {},
  ): BibEntry[] {
    return [...entries].sort((a, b) => {
      const va = by === "year" ? (a.year ?? 0) : (a.custom[by] ?? "");
      const vb = by === "year" ? (b.year ?? 0) : (b.custom[by] ?? "");
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return order === "desc" ? -cmp : cmp;
    });
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  /**
   * Format a single entry as an HTML string (no wrapper element).
   * Applies title linking and badge injection.
   */
  formatEntry(entry: BibEntry, options: FormatOptions = {}): string {
    const rendered = this.renderCslEntries([entry]);
    const raw = rendered[0]?.[1] ?? "";
    const innerHtml = unwrapCslEntry(raw) ?? raw.trim();
    return this.decorateEntryHtml(entry, innerHtml, options);
  }

  /**
   * Format a list of entries as a complete HTML bibliography.
   */
  formatHtml(entries: BibEntry[], options: FormatOptions = {}): string {
    if (entries.length === 0) return "";

    const tag = options.list ?? "ol";
    const attrs = options.listAttributes ?? (tag === "ol" ? { reversed: true } : {});
    const attrStr = renderAttributes(attrs);

    // Render all entries in one citeproc run so style-dependent numbering/state
    // (e.g. vancouver left-margin labels) remains correct.
    const rendered = this.renderCslEntries(entries);
    const renderedMap = new Map<string, string>(rendered.map(([id, html]) => [id, html]));

    const itemTag = tag === "div" ? "div" : "li";
    const items = entries.map((entry, index) => {
      const id = String(entry.csl.id ?? entry.key);
      const raw = renderedMap.get(id)
        ?? renderedMap.get(entry.key)
        ?? rendered[index]?.[1]
        ?? "";
      const innerRaw = unwrapCslEntry(raw) ?? raw.trim();
      const inner = this.decorateEntryHtml(entry, innerRaw, options);
      return `<${itemTag} data-csl-entry-id="${escapeAttr(entry.key)}" class="csl-entry">${inner}</${itemTag}>`;
    });

    let html = `<${tag}${attrStr} class="csl-bib-body">\n${items.join("\n")}\n</${tag}>`;

    if (options.linkifyUrls !== false) {
      html = linkifyBareUrls(html);
    }

    return html;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private registerStyle(cslStyle?: string): string {
    if (!cslStyle) return "apa";

    const config = Cite.plugins.config.get("@csl");
    const templates = config.templates;
    if (templateExists(templates, cslStyle)) {
      return cslStyle;
    }

    const xml = readFileIfExists(cslStyle) ?? (looksLikeXml(cslStyle) ? cslStyle : null);
    if (!xml) {
      throw new Error(
        `Unknown CSL style "${cslStyle}". Provide a built-in name, file path, or CSL XML.`,
      );
    }

    const name = `custom-${hashString(xml)}`;
    if (!templateExists(templates, name)) {
      templates.add(name, xml);
    }
    return name;
  }

  private renderCslEntries(entries: BibEntry[]): Array<[string, string]> {
    const cite = new Cite(entries.map((entry) => entry.csl));
    const out = cite.format("bibliography", {
      format: "html",
      template: this.templateName,
      lang: "en-US",
      nosort: true,
      asEntryArray: true,
    }) as unknown;

    if (!Array.isArray(out)) return [];

    return out
      .filter((item): item is [unknown, unknown] => Array.isArray(item) && item.length >= 2)
      .map(([id, html]) => [String(id), String(html)]);
  }

  private decorateEntryHtml(entry: BibEntry, html: string, options: FormatOptions): string {
    let out = html;

    // Link the title text
    const titleUrl = this.resolveTitleLink(entry, options.titleLink);
    const title = entry.csl.title;
    if (titleUrl && typeof title === "string" && title.trim()) {
      out = this.linkTitle(out, title, titleUrl);
    }

    // Append badges
    const badges = options.badges ?? [];
    const badgeHtml = this.renderBadges(entry, badges);
    if (badgeHtml) {
      out += ` ${badgeHtml}`;
    }

    return out;
  }

  private resolveTitleLink(
    entry: BibEntry,
    fields?: string[],
  ): string | null {
    const order = fields ?? ["url", "doi", "arxiv"];
    for (const field of order) {
      const value = entry.raw[field] ?? entry.csl[field.toUpperCase()] ?? entry.csl[field];
      if (!value) continue;
      const raw = String(value).trim();
      if (!raw) continue;

      if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) {
        return sanitizeUrl(raw);
      }

      if (field === "doi") {
        const doi = raw.replace(/^doi:\s*/i, "");
        return sanitizeUrl(`https://doi.org/${doi}`);
      }

      if (field === "arxiv") {
        return sanitizeUrl(`https://arxiv.org/abs/${raw.replace(/v\d+$/, "")}`);
      }
    }
    return null;
  }

  private linkTitle(html: string, title: string, url: string): string {
    const pattern = buildHtmlTextPattern(title);
    if (!pattern) return html;

    const regex = new RegExp(pattern);
    const tokens = html.split(/(<[^>]*>)/g);

    let insideAnchor = false;
    let insideScript = false;
    let insideStyle = false;
    let linked = false;

    const output: string[] = [];

    for (const token of tokens) {
      if (token.startsWith("<")) {
        const lower = token.toLowerCase();
        if (/^<a\b/.test(lower)) insideAnchor = true;
        if (/^<\/a\b/.test(lower)) insideAnchor = false;
        if (/^<script\b/.test(lower)) insideScript = true;
        if (/^<\/script\b/.test(lower)) insideScript = false;
        if (/^<style\b/.test(lower)) insideStyle = true;
        if (/^<\/style\b/.test(lower)) insideStyle = false;
        output.push(token);
        continue;
      }

      if (linked || insideAnchor || insideScript || insideStyle) {
        output.push(token);
        continue;
      }

      const replaced = token.replace(regex, (match) => {
        linked = true;
        return `<a href="${escapeAttr(url)}">${match}</a>`;
      });
      output.push(replaced);
    }

    return output.join("");
  }

  private renderBadges(entry: BibEntry, badges: BadgeConfig[]): string {
    const parts: string[] = [];

    for (const badge of badges) {
      const rawValue = entry.raw[badge.field] ?? entry.custom[badge.field];
      if (rawValue == null) continue;

      const strValue = String(rawValue);
      let insertValue: string;

      if (badge.match) {
        const m = strValue.match(badge.match);
        if (!m) continue;
        insertValue = m[1] ?? m[0];
      } else {
        insertValue = strValue;
      }

      const unsafeUrl = badge.url.replace(/\$1/g, insertValue);
      const safeUrl = sanitizeUrl(unsafeUrl);
      if (!safeUrl) continue;

      const cls = badge.className ? ` class="${escapeAttr(badge.className)}"` : "";
      parts.push(
        `<a${cls} href="${escapeAttr(safeUrl)}">${escapeHtml(String(badge.label))}</a>`,
      );
    }

    if (parts.length === 0) return "";
    return `<span class="bib-links">${parts.join(" ")}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Standalone utilities (exported for reuse)
// ---------------------------------------------------------------------------

/**
 * Auto-linkify bare `http(s)://` URLs in HTML that aren't already inside
 * an `<a>` tag. Trailing punctuation (`.`, `,`, `;`, etc.) is kept outside
 * the link.
 */
export function linkifyBareUrls(html: string): string {
  const tokens = html.split(/(<[^>]*>)/g);
  const urlRegex = /(https?:\/\/[^\s<>"',;)]+)/g;

  let insideAnchor = false;
  let insideScript = false;
  let insideStyle = false;
  const output: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("<")) {
      const lower = token.toLowerCase();
      if (/^<a\b/.test(lower)) insideAnchor = true;
      if (/^<\/a\b/.test(lower)) insideAnchor = false;
      if (/^<script\b/.test(lower)) insideScript = true;
      if (/^<\/script\b/.test(lower)) insideScript = false;
      if (/^<style\b/.test(lower)) insideStyle = true;
      if (/^<\/style\b/.test(lower)) insideStyle = false;
      output.push(token);
      continue;
    }

    if (insideAnchor || insideScript || insideStyle) {
      output.push(token);
      continue;
    }

    output.push(
      token.replace(urlRegex, (match) => {
        const trimmed = match.replace(/[.,;:!?)]+$/, "");
        const trailing = match.slice(trimmed.length);
        return `<a href="${escapeAttr(trimmed)}">${trimmed}</a>${trailing}`;
      }),
    );
  }

  return output.join("");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readFileIfExists(input: string): string | null {
  if (!existsSync(input)) return null;
  try {
    if (!statSync(input).isFile()) return null;
  } catch {
    return null;
  }
  return readFileSync(input, "utf-8");
}

function maybeReadFile(input: string): string {
  return readFileIfExists(input) ?? input;
}

function looksLikeXml(input: string): boolean {
  return /^\s*</.test(input);
}

function templateExists(templates: any, name: string): boolean {
  if (typeof templates.has === "function" && templates.has(name)) return true;
  if (Array.isArray(templates.list?.()) && templates.list().includes(name)) return true;
  return false;
}

function unwrapCslEntry(entryHtml: string): string | null {
  const trimmed = entryHtml.trim();
  const match = trimmed.match(/^<div\b([^>]*)>([\s\S]*)<\/div>$/s);
  if (!match) return null;

  const attrs = match[1] ?? "";
  if (!/\bclass\s*=\s*["'][^"']*\bcsl-entry\b/i.test(attrs)) return null;

  return (match[2] ?? "").trim();
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function buildHtmlTextPattern(text: string): string {
  let pattern = "";
  for (const ch of text) {
    switch (ch) {
      case "&":
        pattern += "(?:&amp;|&#38;)";
        break;
      case "<":
        pattern += "&lt;";
        break;
      case ">":
        pattern += "&gt;";
        break;
      case '"':
        pattern += "(?:&quot;|&#34;)";
        break;
      case "'":
        pattern += "(?:&#39;|&apos;)";
        break;
      default:
        pattern += escapeRegex(ch);
    }
  }
  return pattern;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAttributes(attrs: Record<string, string | boolean>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) parts.push(k);
    else if (v !== false) parts.push(`${k}="${escapeAttr(String(v))}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
