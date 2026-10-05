# Changelog

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
