import { readFileSync } from "node:fs";
import Cite from "citation-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Declares a badge link to render alongside bibliography entries.
 *
 * The `url` is a template string where `$1` is replaced by the (optionally
 * transformed) field value.  When `match` is provided, the field value is
 * tested against it first: if it doesn't match the badge is skipped; if it
 * does, `$1` in the URL is replaced by the **first capture group** (or the
 * full match if there is no capture group).
 *
 * @example
 * // Simple prefix-style DOI badge:
 * { field: 'doi', label: 'doi', url: 'https://doi.org/$1' }
 *
 * @example
 * // Strip trailing version from arXiv identifiers:
 * { field: 'arxiv', label: 'arXiv',
 *   url: 'https://arxiv.org/abs/$1',
 *   match: /^(.+?)(?:v\d+)?$/ }
 *
 * @example
 * // Only link zbMATH entries that look like a Zbl number:
 * { field: 'zbl', label: 'zbMATH',
 *   url: 'https://zbmath.org/?q=an:$1',
 *   match: /^(\d{4}\.\d{5})$/ }
 */
export interface BadgeConfig {
  /** BibTeX field name to read the value from. */
  field: string;
  /** Text to display inside the badge. */
  label: string;
  /** URL template — `$1` is replaced by the field value. */
  url: string;
  /**
   * Optional regex applied to the field value.
   *
   * - If it **doesn't match**, the badge is skipped for that entry.
   * - If it **matches**, `$1` in the URL is replaced by the first capture
   *   group (or the full match when there are no capture groups).
   */
  match?: RegExp;
  /** CSS class name(s) for the badge `<a>` element. */
  className?: string;
}

/** Options passed to {@link Bibliography.formatHtml}. */
export interface FormatOptions {
  /**
   * Fields to use for linking the title, checked in order.
   * A `doi` value is expanded to `https://doi.org/<value>`, an `arxiv`
   * value to `https://arxiv.org/abs/<value>`, and any field whose value
   * already starts with `http` is used as-is.
   *
   * @default ['url', 'doi', 'arxiv']
   */
  titleLink?: string[];

  /** Badge configurations to append to each entry. */
  badges?: BadgeConfig[];

  /**
   * Wrapper list element.
   * @default 'ol'
   */
  list?: "ol" | "ul" | "div";

  /**
   * HTML attributes for the wrapper element (e.g. `{ reversed: true }`).
   * Boolean `true` renders as a valueless attribute.
   *
   * @default { reversed: true }  (when list is 'ol')
   */
  listAttributes?: Record<string, string | boolean>;

  /**
   * Auto-linkify bare `http(s)://` URLs in the rendered output that aren't
   * already inside `<a>` tags.
   *
   * @default true
   */
  linkifyUrls?: boolean;
}

/** A bibliography entry enriched with custom BibTeX fields. */
export interface BibEntry {
  /** The CSL-JSON object used by citation-js for formatting. */
  csl: Record<string, any>;
  /** The BibTeX citation key. */
  key: string;
  /** Publication year (extracted from CSL `issued`). */
  year: number | null;
  /**
   * Custom BibTeX fields that were requested via `customFields`.
   * Only fields that are present on the entry appear here.
   */
  custom: Record<string, string>;
  /** The full raw BibTeX properties (unfiltered). */
  raw: Record<string, any>;
}

/** Options for constructing a {@link Bibliography}. */
export interface BibliographyOptions {
  /**
   * BibTeX input — either a raw BibTeX string or a file path.
   * When a file path is given, it is read synchronously at construction time.
   */
  data: string;

  /**
   * CSL style — a built-in template name (e.g. `'apa'`), raw CSL XML, or a
   * file path to a `.csl` file.  When a file path is given, it is read
   * synchronously.
   *
   * When a raw XML string or file is provided, it is registered under the
   * name `'custom'` and used automatically by {@link Bibliography.formatHtml}
   * and {@link Bibliography.formatEntry}.
   *
   * @default 'apa'
   */
  cslStyle?: string;

  /**
   * BibTeX field names to preserve through the citation-js pipeline.
   * These are extracted from the raw BibTeX parse and made available on
   * each {@link BibEntry} under `.custom`.
   *
   * Common examples: `['publication-status', 'arxiv', 'mrnumber', 'project']`.
   */
  customFields?: string[];
}

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
        const key = csl["citation-key"] || csl.id;
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
    const cite = new Cite([entry.csl]);
    let html = cite.format("bibliography", {
      format: "html",
      template: this.templateName,
      lang: "en-US",
    }) as string;

    // Strip the outer csl-bib-body and csl-entry wrapper divs
    html = html
      .replace(/^<div class="csl-bib-body">\s*/s, "")
      .replace(/\s*<\/div>\s*$/s, "")
      .replace(/^<div[^>]*class="csl-entry"[^>]*>\s*/s, "")
      .replace(/\s*<\/div>\s*$/s, "");

    // Link the title (first <i>...</i>)
    const titleUrl = this.resolveTitleLink(entry, options.titleLink);
    if (titleUrl) {
      html = html.replace(
        /(<i>)(.*?)(<\/i>)/,
        `<a href="${escapeAttr(titleUrl)}">$1$2$3</a>`,
      );
    }

    // Append badges
    const badges = options.badges ?? [];
    const badgeHtml = this.renderBadges(entry, badges);
    if (badgeHtml) {
      html += ` ${badgeHtml}`;
    }

    return html;
  }

  /**
   * Format a list of entries as a complete HTML bibliography.
   */
  formatHtml(entries: BibEntry[], options: FormatOptions = {}): string {
    if (entries.length === 0) return "";

    const tag = options.list ?? "ol";
    const attrs = options.listAttributes ?? (tag === "ol" ? { reversed: true } : {});
    const attrStr = renderAttributes(attrs);

    const items = entries.map((e) => {
      const inner = this.formatEntry(e, options);
      return `<li data-csl-entry-id="${escapeAttr(e.key)}" class="csl-entry">${inner}</li>`;
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

    const builtins = ["apa", "vancouver", "harvard1"];
    if (builtins.includes(cslStyle)) return cslStyle;

    const xml = maybeReadFile(cslStyle);
    const config = Cite.plugins.config.get("@csl");
    config.templates.add("custom", xml);
    return "custom";
  }

  private resolveTitleLink(
    entry: BibEntry,
    fields?: string[],
  ): string | null {
    const order = fields ?? ["url", "doi", "arxiv"];
    for (const field of order) {
      const value = entry.raw[field] ?? entry.csl[field.toUpperCase()] ?? entry.csl[field];
      if (!value) continue;
      const v = String(value);
      if (v.startsWith("http")) return v;
      if (field === "doi") return `https://doi.org/${v}`;
      if (field === "arxiv") return `https://arxiv.org/abs/${v.replace(/v\d+$/, "")}`;
      return v;
    }
    return null;
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
        if (!m) continue; // regex didn't match → skip badge
        insertValue = m[1] ?? m[0]; // first capture group, or full match
      } else {
        insertValue = strValue;
      }

      const url = badge.url.replace("$1", insertValue);
      const cls = badge.className ? ` class="${escapeAttr(badge.className)}"` : "";
      parts.push(`<a${cls} href="${escapeAttr(url)}">${badge.label}</a>`);
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
 * an `<a>` tag.  Trailing punctuation (`.`, `,`, `;`, etc.) is kept outside
 * the link.
 */
export function linkifyBareUrls(html: string): string {
  return html.replace(
    /(?<!href="|href='|>)(https?:\/\/[^\s<,;)]+)/g,
    (_match, url: string) => {
      const trimmed = url.replace(/[.,;:!?)]+$/, "");
      const trailing = url.slice(trimmed.length);
      return `<a href="${trimmed}">${trimmed}</a>${trailing}`;
    },
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function maybeReadFile(input: string): string {
  // If it looks like XML or BibTeX content, return as-is
  if (input.includes("\n") || input.startsWith("@") || input.startsWith("<")) {
    return input;
  }
  // Otherwise treat as a file path
  return readFileSync(input, "utf-8");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderAttributes(attrs: Record<string, string | boolean>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) parts.push(k);
    else if (v !== false) parts.push(`${k}="${escapeAttr(String(v))}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}
