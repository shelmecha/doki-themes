# Changelog

## 0.2.8 (2026-10-27)

- Warp support. When Warp is installed (`%APPDATA%\warp\Warp` exists), each pick writes the theme to `%APPDATA%\warp\Warp\data\themes\doki-theme-picker.yaml`: the same 16 terminal colors as the Windows Terminal scheme, plus background, foreground, cursor and accent. Unverified in Warp itself.
- In Warp, pick "Doki Theme Picker" one time under Settings > Appearance > Themes. The file keeps that name, so later picks change the same theme. The old file is backed up to `backups\settings\warp\` first.

## 0.2.7 (2026-10-22)

- The status line can now change color at once in every open Claude Code window. Add `--theme <any-name>` to your `statusLine` command in `settings.json`, for example `node statusline.mjs --theme doki-ram`. At each pick, the picker sets that name to the picked theme (for example `doki-vanilla`), and Claude Code runs the status line again because its command changed. Your script must ignore the argument.
- The picker changes only the `--theme` name in that command and nothing else in `settings.json`. It reads the file again just before it writes, and it backs up the file to `backups\settings\claude\` first. A command without `--theme` is not changed.

## 0.2.6 (2026-10-18)

- Claude Code now shows the theme you pick at once. Before, the picker changed Windows Terminal at once, but Claude Code kept the old theme until you used `/theme` or started Claude Code again. Claude Code reads the theme in `settings.json` only when it starts and from `/theme`, but it reads a theme file again when the file changes.
- The picker now also writes each theme to one fixed file, `%USERPROFILE%\.claude\themes\doki-theme-picker.json`, and sets `settings.json` to `custom:doki-theme-picker`. `/theme` shows this file as "<theme> (picker)". The theme's own file stays, so `/theme` still lists each theme.
- Restart Claude Code one time when the picker says "Restart Claude Code one time to see it here." It says this when Claude Code uses a different theme file: at the first pick after the update, and after you pick a theme with `/theme`. After the restart, each pick shows at once.

## 0.2.5 (2026-10-12)

- Light themes: text is now dark enough to read. Before, light themes kept some colors that are made for a dark background. In Emilia Light, dim text was `#aaaaaa` (2.1:1) and the warning color was `#EFA554` (1.9:1). Now the picker makes each text color darker until its contrast is 7:1 for the main text, 3.5:1 for dim text and 4.5:1 for all other text. Dark themes do not change.
- The accent file gets the same darker colors, so other mods can read them on a light background.
- Re-apply a light theme to get the new colors. The picker writes the theme files only when you apply a theme.

## 0.2.4 (2026-10-12)

- Backups now go in a folder for each kind of file, under `%USERPROFILE%\.claude\backups\`: `settings\claude\` for `settings.json`, `settings\windows-terminal\` for the Windows Terminal settings, and `themes\` for theme files. The file names do not change. Before, all backups were in `backups\` with no folders. The picker makes a folder if it is not there. It does not move old backups.

## 0.2.3 (2026-10-06)

- Claude Code's `/theme` and the picker now give the same result. If you pick a Doki or termcn theme with `/theme`, the picker sets the Windows Terminal scheme and the accent file at your next prompt. Before, `/theme` changed only Claude Code.
- `/theme` lists only the themes that the picker applied one time. Use the picker to get a theme into that list.

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
