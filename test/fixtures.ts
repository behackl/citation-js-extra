/** Minimal BibTeX fixture with custom fields for testing. */
export const SAMPLE_BIB = `
@Article{doe-smith:2023:widgets,
  author    = {Doe, Jane and Smith, Alex},
  title     = {On the Enumeration of Widgets},
  journal   = {J. Widget Sci.},
  volume    = {42},
  pages     = {1--15},
  year      = {2023},
  doi       = {10.1234/jws.2023.001},
  arxiv     = {2301.00001},
  url       = {https://example.com/widgets},
  mrnumber  = {4500001},
  publication-status = {published},
  project   = {WidgetFund-1234},
}

@Article{doe:2024:gadgets,
  author    = {Doe, Jane},
  title     = {Gadgets and their Applications},
  journal   = {Gadget Rev.},
  volume    = {7},
  number    = {3},
  pages     = {100--120},
  year      = {2024},
  doi       = {10.5678/gr.2024.003},
  publication-status = {published},
}

@Misc{doe-jones:2025:preprint,
  author    = {Doe, Jane and Jones, Pat},
  title     = {A Preprint on Sprockets},
  howpublished = {arXiv:2501.99999v2 [math.CO]},
  year      = {2025},
  arxiv     = {2501.99999v2},
  url       = {https://arxiv.org/abs/2501.99999v2},
  publication-status = {preprint},
}

@Manual{doe:2022:software,
  author    = {Doe, Jane},
  title     = {widgetlib -- a Python library for widget analysis},
  url       = {https://github.com/jdoe/widgetlib},
  year      = {2022},
  note      = {Available at \\url{https://github.com/jdoe/widgetlib}},
  publication-status = {software},
}

@InProceedings{smith-doe:2021:conf,
  author    = {Smith, Alex and Doe, Jane},
  title     = {Widget Bounds in Higher Dimensions},
  booktitle = {Proceedings of the International Widget Conference (IWC 2021)},
  pages     = {55--62},
  year      = {2021},
  doi       = {10.9999/iwc.2021.007},
  publication-status = {published},
  zbl       = {7654.12345},
}
`;
