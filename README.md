# @behackl/citation-js-extras

Preserve custom BibTeX fields through [citation-js](https://citation.js.org/) and render academic bibliographies with linked titles, configurable badges, and more.

## The problem

citation-js converts BibTeX to CSL-JSON, but silently **drops all non-standard fields** during the conversion. There is no plugin hook or configuration option to preserve them. Fields like `arxiv`, `mrnumber`, `publication-status`, or project identifiers are lost.

This package solves the problem with a two-pass parsing strategy: one pass extracts the raw BibTeX fields, the other produces CSL-JSON for formatting. The results are merged so you get the best of both worlds.

## Install

```bash
npm install @behackl/citation-js-extras citation-js
# or
pnpm add @behackl/citation-js-extras citation-js
```

`citation-js` is a **peer dependency** — you bring your own version.

## Quick start

```ts
import { Bibliography } from "@behackl/citation-js-extras";

const bib = new Bibliography({
  data: "./references.bib", // file path or raw BibTeX string
  cslStyle: "./my-style.csl", // optional: file path, raw XML, or registered template name
  customFields: ["publication-status", "arxiv", "mrnumber"],
});

// Filter and sort
const published = bib.filter({ "publication-status": "published" });
const sorted = bib.sort(published, { by: "year", order: "desc" });

// Render HTML
const html = bib.formatHtml(sorted, {
  titleLink: ["url", "doi", "arxiv"],
  badges: [
    { field: "doi", label: "doi", url: "https://doi.org/$1", className: "badge-doi" },
    {
      field: "arxiv",
      label: "arXiv",
      url: "https://arxiv.org/abs/$1",
      match: /^(.+?)(?:v\d+)?$/,
      className: "badge-arxiv",
    },
  ],
});
```

## API

### `new Bibliography(options)`

| Option | Type | Description |
|---|---|---|
| `data` | `string` | BibTeX input — a raw string or a file path. |
| `cslStyle` | `string?` | CSL style — a registered template name, raw XML, or a file path. Defaults to `'apa'`. |
| `customFields` | `string[]?` | BibTeX field names to preserve. These appear on each entry under `.custom`. |

### `bib.entries`

All parsed entries as `BibEntry[]`:

```ts
interface BibEntry {
  csl: Record<string, any>; // CSL-JSON data (for citation-js)
  key: string; // BibTeX citation key
  year: number | null; // extracted from CSL `issued`
  custom: Record<string, string>; // declared custom fields
  raw: Record<string, any>; // all raw BibTeX properties
}
```

### `bib.filter(criteria)`

Filter entries by custom field values. All criteria must match (AND logic).

```ts
bib.filter({ "publication-status": "published" });
bib.filter({ "publication-status": "published", project: "ABC-123" });
```

### `bib.sort(entries, options?)`

Return a sorted **copy** of the entries (the input is not mutated).

```ts
bib.sort(entries); // by year, descending (default)
bib.sort(entries, { by: "year", order: "asc" });
```

### `bib.formatHtml(entries, options?)`

Render entries as a complete HTML bibliography list.

```ts
bib.formatHtml(entries, {
  titleLink: ["url", "doi", "arxiv"],
  badges: [ /* ... */ ],
  list: "ol", // 'ol', 'ul', or 'div' (div uses <div class="csl-entry"> children)
  listAttributes: { reversed: true },
  linkifyUrls: true,
});
```

Entries are formatted in one citeproc pass, so style-dependent state (for example numeric labels in Vancouver) remains correct.

### `bib.formatEntry(entry, options?)`

Render a single entry as an HTML string (no list wrapper). The title link targets the actual CSL title text, regardless of italics.

For citation styles that depend on multi-entry context (numbered labels, ibid behavior, etc.), prefer `formatHtml(...)`.

Title links are only created for safe URL schemes (`http`, `https`, `mailto`) or normalized DOI/arXiv links.

### Badges

Badges are small inline links appended to each entry. They are configured declaratively:

```ts
interface BadgeConfig {
  field: string; // BibTeX field name to read
  label: string; // display text (e.g. "doi", "arXiv")
  url: string; // URL template — $1 is replaced by the field value
  match?: RegExp; // optional: validate/transform the field value
  className?: string; // CSS class(es) for the <a> element
}
```

The `url` template uses `$1` as a placeholder for the field value:

```ts
{ field: "doi", label: "doi", url: "https://doi.org/$1" }
// doi: "10.1234/example" → href="https://doi.org/10.1234/example"
```

When `match` is provided, the field value is tested against the regex. If it doesn't match, the badge is skipped. If it matches, `$1` in the URL is replaced by the **first capture group** (or the full match if there are no capture groups):

```ts
// Strip version suffix from arXiv IDs:
{ field: "arxiv", label: "arXiv",
  url: "https://arxiv.org/abs/$1",
  match: /^(.+?)(?:v\d+)?$/ }
// "2301.00001v3" → capture group "2301.00001" → href=".../2301.00001"

// Only link if the field looks like a valid identifier:
{ field: "zbl", label: "zbMATH",
  url: "https://zbmath.org/?q=an:$1",
  match: /^(\d+\.\d+)$/ }
// "7654.12345" → match → linked
// "not-a-number" → no match → badge skipped
```

Badge labels are HTML-escaped before rendering. Generated badge links are emitted only for `http(s)` and `mailto:` URLs; unsafe schemes are skipped.

### `linkifyBareUrls(html)`

Standalone utility: auto-linkify bare `http(s)://` URLs in HTML text nodes that aren't already inside `<a>`, `<script>`, or `<style>` tags. Trailing punctuation is kept outside the link.

```ts
import { linkifyBareUrls } from "@behackl/citation-js-extras";

linkifyBareUrls("See https://example.com.");
// → 'See <a href="https://example.com">https://example.com</a>.'
```

## Custom CSL styles

Pass a file path or raw XML to `cslStyle`. You can also pass the name of any template already registered with citation-js:

```ts
const bib = new Bibliography({
  data: bibtex,
  cslStyle: "./styles/my-department.csl",
  customFields: ["publication-status"],
});
```

The style is registered with citation-js and used for all formatting calls.

Raw CSL XML styles are internally registered under deterministic content-hash names to avoid collisions between multiple `Bibliography` instances.

## How it works

citation-js has a hardcoded list of ~106 BibTeX → CSL field mappings. Any field not in that list is silently dropped. There is no plugin API to extend this mapping.

This package works around the limitation with a **two-pass parse**:

1. `Cite.plugins.input.chainLink(bibData)` — returns raw BibTeX entries with **all** fields preserved (but no CSL conversion).
2. `new Cite(bibData)` — returns CSL-JSON entries (needed for formatted output via citeproc) but with custom fields stripped.

The results are merged by citation key, giving you CSL-formatted output **and** access to every custom BibTeX field.

## License

MIT
