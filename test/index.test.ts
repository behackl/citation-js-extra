import { describe, it, expect } from "vitest";
import { Bibliography, linkifyBareUrls } from "../src/index.js";
import { SAMPLE_BIB } from "./fixtures.js";

function makeBib(overrides: Record<string, unknown> = {}) {
  return new Bibliography({
    data: SAMPLE_BIB,
    customFields: ["publication-status", "arxiv", "mrnumber", "project", "zbl"],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Parsing & custom fields
// ---------------------------------------------------------------------------

describe("parsing", () => {
  it("parses all entries", () => {
    const bib = makeBib();
    expect(bib.entries).toHaveLength(5);
  });

  it("preserves declared custom fields", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    expect(widgets.custom["publication-status"]).toBe("published");
    expect(widgets.custom.arxiv).toBe("2301.00001");
    expect(widgets.custom.mrnumber).toBe("4500001");
    expect(widgets.custom.project).toBe("WidgetFund-1234");
  });

  it("does not include undeclared custom fields", () => {
    const bib = new Bibliography({
      data: SAMPLE_BIB,
      customFields: ["publication-status"],
    });
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    expect(widgets.custom["publication-status"]).toBe("published");
    expect(widgets.custom.arxiv).toBeUndefined();
  });

  it("extracts year from CSL issued field", () => {
    const bib = makeBib();
    const gadgets = bib.entries.find((e) => e.key.includes("gadgets"))!;
    expect(gadgets.year).toBe(2024);
  });

  it("keeps raw properties accessible", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    expect(widgets.raw.doi).toBe("10.1234/jws.2023.001");
    expect(widgets.raw["publication-status"]).toBe("published");
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("filter", () => {
  it("filters by a single custom field", () => {
    const bib = makeBib();
    const published = bib.filter({ "publication-status": "published" });
    expect(published).toHaveLength(3);
    expect(published.every((e) => e.custom["publication-status"] === "published")).toBe(true);
  });

  it("filters by multiple criteria (AND)", () => {
    const bib = makeBib();
    const result = bib.filter({
      "publication-status": "published",
      project: "WidgetFund-1234",
    });
    expect(result).toHaveLength(1);
    expect(result[0].key).toContain("widgets");
  });

  it("returns empty array when nothing matches", () => {
    const bib = makeBib();
    expect(bib.filter({ "publication-status": "retracted" })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("sort", () => {
  it("sorts by year descending by default", () => {
    const bib = makeBib();
    const sorted = bib.sort(bib.entries);
    const years = sorted.map((e) => e.year);
    expect(years).toEqual([2025, 2024, 2023, 2022, 2021]);
  });

  it("sorts by year ascending", () => {
    const bib = makeBib();
    const sorted = bib.sort(bib.entries, { order: "asc" });
    const years = sorted.map((e) => e.year);
    expect(years).toEqual([2021, 2022, 2023, 2024, 2025]);
  });

  it("does not mutate the input array", () => {
    const bib = makeBib();
    const original = [...bib.entries];
    bib.sort(bib.entries, { order: "asc" });
    expect(bib.entries.map((e) => e.key)).toEqual(original.map((e) => e.key));
  });
});

// ---------------------------------------------------------------------------
// Formatting: title links
// ---------------------------------------------------------------------------

describe("formatEntry – title linking", () => {
  it("links title to URL by default", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    const html = bib.formatEntry(widgets);
    expect(html).toContain('<a href="https://example.com/widgets"><i>');
    expect(html).toContain("On the Enumeration of Widgets");
  });

  it("falls back to DOI when no URL", () => {
    const bib = makeBib();
    const gadgets = bib.entries.find((e) => e.key.includes("gadgets"))!;
    const html = bib.formatEntry(gadgets);
    expect(html).toContain('href="https://doi.org/10.5678/gr.2024.003"');
  });

  it("respects custom titleLink field order", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    // DOI first instead of URL
    const html = bib.formatEntry(widgets, { titleLink: ["doi", "url"] });
    expect(html).toContain('href="https://doi.org/10.1234/jws.2023.001"');
  });
});

// ---------------------------------------------------------------------------
// Formatting: badges
// ---------------------------------------------------------------------------

const BADGES = [
  { field: "doi", label: "doi", url: "https://doi.org/$1", className: "bib-doi" },
  {
    field: "arxiv",
    label: "arXiv",
    url: "https://arxiv.org/abs/$1",
    match: /^(.+?)(?:v\d+)?$/,
    className: "bib-arxiv",
  },
  {
    field: "mrnumber",
    label: "MR",
    url: "https://mathscinet.ams.org/mathscinet-getitem?mr=$1",
    className: "bib-mr",
  },
  {
    field: "zbl",
    label: "zbMATH",
    url: "https://zbmath.org/?q=an:$1",
    match: /^(\d+\.\d+)$/,
    className: "bib-zbl",
  },
];

describe("formatEntry – badges", () => {
  it("renders doi and arxiv badges", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    const html = bib.formatEntry(widgets, { badges: BADGES });
    expect(html).toContain('class="bib-doi"');
    expect(html).toContain('href="https://doi.org/10.1234/jws.2023.001"');
    expect(html).toContain('class="bib-arxiv"');
    expect(html).toContain('href="https://arxiv.org/abs/2301.00001"');
  });

  it("strips arXiv version suffix via match regex", () => {
    const bib = makeBib();
    const preprint = bib.entries.find((e) => e.key.includes("preprint"))!;
    const html = bib.formatEntry(preprint, { badges: BADGES });
    // The badge link should have the version stripped
    expect(html).toContain('class="bib-arxiv" href="https://arxiv.org/abs/2501.99999"');
  });

  it("renders MR badge when mrnumber is present", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    const html = bib.formatEntry(widgets, { badges: BADGES });
    expect(html).toContain('class="bib-mr"');
    expect(html).toContain("mr=4500001");
  });

  it("skips badges for missing fields", () => {
    const bib = makeBib();
    const gadgets = bib.entries.find((e) => e.key.includes("gadgets"))!;
    const html = bib.formatEntry(gadgets, { badges: BADGES });
    expect(html).toContain("bib-doi");
    expect(html).not.toContain("bib-arxiv");
    expect(html).not.toContain("bib-mr");
  });

  it("validates field value against match regex", () => {
    const bib = makeBib();
    const conf = bib.entries.find((e) => e.key.includes("conf"))!;
    const html = bib.formatEntry(conf, { badges: BADGES });
    // zbl field is "7654.12345" which matches /^(\d+\.\d+)$/
    expect(html).toContain("bib-zbl");
    expect(html).toContain("zbmath.org/?q=an:7654.12345");
  });

  it("skips badge when match regex fails", () => {
    const bib = new Bibliography({
      data: `@Article{test, author={A B}, title={T}, year={2024}, zbl={not-a-number}}`,
      customFields: ["zbl"],
    });
    const entry = bib.entries[0];
    const html = bib.formatEntry(entry, { badges: BADGES });
    expect(html).not.toContain("bib-zbl");
  });
});

// ---------------------------------------------------------------------------
// Formatting: full HTML list
// ---------------------------------------------------------------------------

describe("formatHtml", () => {
  it("wraps entries in <ol reversed> by default", () => {
    const bib = makeBib();
    const html = bib.formatHtml(bib.entries);
    expect(html).toMatch(/^<ol reversed class="csl-bib-body">/);
    expect(html).toMatch(/<\/ol>$/);
    expect((html.match(/<li /g) ?? []).length).toBe(5);
  });

  it("supports <ul> wrapper", () => {
    const bib = makeBib();
    const html = bib.formatHtml(bib.entries, { list: "ul" });
    expect(html).toMatch(/^<ul class="csl-bib-body">/);
    expect(html).toMatch(/<\/ul>$/);
  });

  it("supports custom list attributes", () => {
    const bib = makeBib();
    const html = bib.formatHtml(bib.entries, {
      list: "ol",
      listAttributes: { reversed: true, start: "10" },
    });
    expect(html).toContain("reversed");
    expect(html).toContain('start="10"');
  });

  it("returns empty string for empty input", () => {
    const bib = makeBib();
    expect(bib.formatHtml([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// URL linkification
// ---------------------------------------------------------------------------

describe("linkifyBareUrls", () => {
  it("linkifies a bare URL", () => {
    expect(linkifyBareUrls("see https://example.com for details")).toBe(
      'see <a href="https://example.com">https://example.com</a> for details',
    );
  });

  it("trims trailing punctuation", () => {
    expect(linkifyBareUrls("Visit https://example.com.")).toBe(
      'Visit <a href="https://example.com">https://example.com</a>.',
    );
  });

  it("does not double-linkify existing <a> tags", () => {
    const input = '<a href="https://example.com">link</a>';
    expect(linkifyBareUrls(input)).toBe(input);
  });
});
