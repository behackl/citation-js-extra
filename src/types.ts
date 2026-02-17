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
   * value to `https://arxiv.org/abs/<value>`, and direct values are only
   * accepted when they use `http`, `https`, or `mailto`.
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
   * already inside `<a>`, `<script>`, or `<style>` tags.
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
   * When raw XML is provided, it is registered under an internal
   * deterministic name (based on content hash) and used automatically by
   * {@link Bibliography.formatHtml} and {@link Bibliography.formatEntry}.
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
