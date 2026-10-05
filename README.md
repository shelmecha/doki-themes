# doki-themes

A theme picker for Claude Code on Windows. Type `/doki-theme-picker` to open a pane with 88 Doki themes (dark and light) and 40 termcn themes. Use the arrow keys to see each theme in the preview at the top of the pane. Press Enter to apply the theme to Claude Code and Windows Terminal.

## Requirements

- Windows 10 or 11.
- Claude Code 2.1.289 or later. This is the version we tested. The picker is a mod (a plugin with hook modules), and older versions do not load mods.
- For the terminal colors: Windows Terminal (the Store build, the Preview build or the unpackaged build). If the picker does not find Windows Terminal, it changes only the Claude Code theme.

## Install

In Claude Code, type these two commands:

```
/plugin marketplace add shelmecha/doki-themes
/plugin install doki-theme-picker@doki-themes
```

Restart Claude Code. Then type `/doki-theme-picker`.

## Use

Type `/doki-theme-picker` to open the picker.

| Key | Action |
|---|---|
| Up / Down or Tab | Move through the list and see the preview |
| Enter | Apply the theme |
| Esc | Close the picker |

To apply a theme without the picker, type its name after the command:

```
/doki-theme-picker rem
/doki-theme-picker termcn dracula
```

## What the picker changes

When you press Enter, the picker writes only these files:

- `%USERPROFILE%\.claude\themes\<theme>.json`: the Claude Code theme.
- `%USERPROFILE%\.claude\settings.json`: the `theme` value.
- The Windows Terminal `settings.json`: it adds a color scheme and sets it on one profile. The profile is the one of the tab that runs Claude Code. If the picker cannot find that profile, it uses your default profile.
- `%USERPROFILE%\.claude\mods\theme-accent.json`: an accent color that other mods can read. The picker writes this file only if the `%USERPROFILE%\.claude\mods` folder already exists.

Before it changes `settings.json` or the Windows Terminal settings, it copies the old file to `%USERPROFILE%\.claude\backups\`. To undo a change, copy the backup back. The picker does not delete old backups. You can delete them when you do not need them.

## Update

```
/plugin marketplace update doki-themes
/plugin update doki-theme-picker@doki-themes
```

Restart Claude Code after the update.

## Uninstall

```
/plugin uninstall doki-theme-picker@doki-themes
```

The uninstall does not change your current theme. To go back to a built-in theme, use `/config`. To remove all the files that the picker wrote:

1. Delete the `doki-*.json` and `termcn-*.json` files in `%USERPROFILE%\.claude\themes\`.
2. In Windows Terminal, open Settings > Color schemes and delete the `Doki ...` and `termcn ...` schemes.
3. Delete `%USERPROFILE%\.claude\mods\theme-accent.json`, if it exists.

## Problems

- **The command is not found after the install.** Restart Claude Code. The picker registers its command when a session starts.
- **The Windows Terminal colors do not change.** Make sure that Claude Code runs in Windows Terminal. The picker skips Windows Terminal if its `settings.json` has comments or trailing commas, because it cannot read that file safely.

## For developers

- Test: `claude plugin test .`
- Validate the manifests: `claude plugin validate --strict .`
- `tsconfig.json` extends `.claude-plugin/types/tsconfig.json`. That folder holds the mod types for your editor, and git ignores it. The test and validate commands work without it.
- `node scripts/build-themes.mjs <path to the Doki Theme VS Code extension>` writes `hooks/themes.ts`.
- `node scripts/build-termcn.mjs` writes `hooks/termcn-themes.ts`.
- Change `version` in `.claude-plugin/plugin.json` for each release. If the version does not change, installed copies do not update.

## Credits and license

The theme colors come from the Doki Theme and termcn projects. See [CREDITS.md](CREDITS.md). This repo uses the MIT license. See [LICENSE](LICENSE).
