# Changelog

## 0.1.0 — 2026-10-07

First release.

- KaTeX math in T3 Code's chat: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, bare environments and ```` ```math ```` fences, with a normalizer that leaves prices, `$HOME`, code and unclosed streaming delimiters alone.
- Copy and Cite give the TeX source; selections snap to whole formulas.
- Loaded at startup by the "T3 Code (LaTeX)" shortcut; T3's files are never changed, and auto-updates, self-relaunches and "Restart to update" keep math.
- Finds T3 through its installer's registry entry, so Stable, Nightly and either install folder work.
