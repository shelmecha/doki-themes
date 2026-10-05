# doki-themes

A Claude Code mod. `/doki-theme-picker` opens a pane with all Doki themes (dark and light) and the termcn themes, with a live preview. Enter applies the theme to Claude Code, Windows Terminal and the shared accent file (`~/.claude/mods/theme-accent.json`).

## Install

Claude Code loads the mod from this folder through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`:

```
C:/Users/Shelvi/Documents/GitHub/doki-themes
```

Restart Claude Code after you change that path.

## Test

```
claude plugin test .
```

## Rebuild the theme tables

- `node scripts/build-themes.mjs` writes `hooks/themes.ts`.
- `node scripts/build-termcn.mjs` writes `hooks/termcn-themes.ts`.

## History

Until 2026-10-05 this mod was in `shelmecha/claude-setup` at `~/.claude/mods/doki-theme-picker`. Old patch scripts in `shelmecha/cli-optimization-with-claude-and-jev` (`patches/apply-29*.mjs`) use that old path.
