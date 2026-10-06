# Changelog

## 0.2.2 (2026-10-06)

- termcn themes: dim text is now readable. Before, the picker used the termcn `muted` color for dim text, but `muted` is a background color. In Kanagawa, dim text was `#16161f` on `#1f1f28`. Now the picker blends the background toward the text color until the contrast is 2.5:1 or more.
- Re-apply a termcn theme to get the new color. The picker writes the theme files only when you apply a theme.

## 0.2.1 (2026-10-06)

- A mouse click on a theme in the list applies that theme. Before, a click applied the theme under the highlight, not the theme you clicked.
- The hint line in the pane names the click.

## 0.2.0 (2026-10-05)

- Windows Terminal: the scheme goes on the profile of the tab that runs Claude Code. If the picker cannot find that profile, it uses the default profile. Before, it always used the Windows PowerShell profile.
- Windows Terminal: the picker also finds the Preview build and the unpackaged build.
- The accent file `~/.claude/mods/theme-accent.json` is written only if `~/.claude/mods` already exists.
- If the user `settings.json` does not exist, the picker makes one with the theme. Before, a fresh install got the theme file but Claude Code did not switch to it.
- If `settings.json` cannot be read, the picker skips it and still applies the rest.
- The command output no longer shows the expected `config.set refused` message.
- The preview in the pane no longer shows personal text.
- `scripts/build-themes.mjs` now needs the extension path and prints a usage line without it.
- README: the tested Claude Code version, the theme-name argument, update steps, full uninstall steps and a problems section.

## 0.1.0 (2026-10-05)

- First public version.
