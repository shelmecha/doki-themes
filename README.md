# doki-themes

A theme picker for Claude Code on Windows. Type `/doki-theme-picker` to open a pane with 88 Doki themes (dark and light) and the termcn themes. Use the arrow keys to see a live preview. Press Enter to apply the theme to Claude Code and Windows Terminal.

## Requirements

- Windows.
- A recent version of Claude Code. The picker is a mod (a plugin with hook modules), and older versions do not load mods.
- For the terminal colors: Windows Terminal from the Microsoft Store. If the picker does not find Windows Terminal, it changes only the Claude Code theme.

## Install

In Claude Code, type these two commands:

```
/plugin marketplace add shelmecha/doki-themes
/plugin install doki-theme-picker@doki-themes
```

Restart Claude Code. Then type `/doki-theme-picker`.

## Use

| Key | Action |
|---|---|
| Up / Down or Tab | Move through the list and see the preview |
| Enter | Apply the theme |
| Esc | Close the picker |

## What the picker changes

When you press Enter, the picker writes only these files:

- `%USERPROFILE%\.claude\themes\<theme>.json`: the Claude Code theme.
- `%USERPROFILE%\.claude\settings.json`: the `theme` value.
- The Windows Terminal `settings.json`: a color scheme for the PowerShell profile.
- `%USERPROFILE%\.claude\mods\theme-accent.json`: an accent color that other mods can read.

Before it changes `settings.json` or the Windows Terminal settings, it copies the old file to `%USERPROFILE%\.claude\backups\`. To undo a change, copy the backup back.

## Uninstall

```
/plugin uninstall doki-theme-picker@doki-themes
```

To go back to a built-in theme, use `/config`.

## For developers

- Test: `claude plugin test .`
- `node scripts/build-themes.mjs <path to the Doki Theme VS Code extension>` writes `hooks/themes.ts`.
- `node scripts/build-termcn.mjs` writes `hooks/termcn-themes.ts`.

## Credits and license

The theme colors come from the Doki Theme and termcn projects. See [CREDITS.md](CREDITS.md). This repo uses the MIT license. See [LICENSE](LICENSE).
