# Changelog

## 0.2.1 — 2026-10-08

- "Quote current state", a button under each visual: it puts one line into the composer saying what the visual is set to and shows (each control's label and value, its readouts, the selected tab or variant; for a Codex visual, the `modelContent` it saved), so the model can see what you see. Nothing is sent until you send it.

## 0.2.0 — 2026-10-07

- Interactive visualizations: a ```` ```visualize ```` block of HTML in a reply runs in the chat, in a sandboxed frame that follows T3's theme and fits its content. Input values are remembered, a visual can be expanded or reset, errors show in it with a button that asks for a fix, and while the block streams a placeholder stands in. d3, three.js and KaTeX are bundled.
- Codex's visualizations: the `visualize{"path": …}` line Codex's visualize plugin puts in a reply shows the HTML file it points at, in the same sandbox, with what those visuals expect from their host (`window.openai` state, follow-ups and links, Lucide icons, tabs, carousels, Codex's style classes).
- `install.cmd` copies the `t3-visualize` Claude Code skill, which tells Claude in T3 when a visual helps and how to write one; `uninstall.cmd` removes it.
- A test run of `uninstall.ps1` (`-Destination`) no longer clears the real `%TEMP%\t3-latex`.

## 0.1.0 — 2026-10-07

First release.

- KaTeX math in T3 Code's chat: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, bare environments and ```` ```math ```` fences, with a normalizer that leaves prices, `$HOME`, code and unclosed streaming delimiters alone.
- Copy and Cite give the TeX source; selections snap to whole formulas.
- Loaded at startup by the "T3 Code (LaTeX)" shortcut; T3's files are never changed, and auto-updates, self-relaunches and "Restart to update" keep math.
- Finds T3 through its installer's registry entry, so Stable, Nightly and either install folder work.
