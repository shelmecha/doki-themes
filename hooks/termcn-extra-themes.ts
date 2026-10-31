// Hand-written light themes shown in the termcn group. scripts/build-termcn.mjs does not touch this file.
// Hex values come from each project's official palette; sources and licences are in CREDITS.md.
// The picker merges these with TERMCN_RAW (see TERMCN_ALL_RAW in hooks/theme.ts).
import type { TermcnRaw } from '../types'

export const TERMCN_EXTRA_RAW: readonly TermcnRaw[] = [
  // https://github.com/primer/primitives (dist/docs/functional/themes/light.json, v11.10.0) - MIT, Copyright (c) 2018 GitHub Inc.
  {"name":"GitHub Light","slug":"github-light","colors":{"accent":"#8250df","background":"#ffffff","error":"#d1242f","focusRing":"#0969da","foreground":"#1f2328","info":"#0969da","muted":"#f6f8fa","mutedForeground":"#59636e","primary":"#0969da","secondary":"#bf3989","selection":"#0969da","success":"#1a7f37","warning":"#9a6700"}},
  // https://github.com/catppuccin/palette (palette.json, latte) - MIT, Copyright (c) 2021 Catppuccin
  {"name":"Catppuccin Latte","slug":"catppuccin-latte","colors":{"accent":"#d20f39","background":"#eff1f5","error":"#d20f39","focusRing":"#8839ef","foreground":"#4c4f69","info":"#1e66f5","muted":"#ccd0da","mutedForeground":"#9ca0b0","primary":"#8839ef","secondary":"#1e66f5","selection":"#ccd0da","success":"#40a02b","warning":"#df8e1d"}},
  // https://github.com/altercation/solarized (README.md palette) - MIT, Copyright (c) 2011 Ethan Schoonover
  {"name":"Solarized Light","slug":"solarized-light","colors":{"accent":"#d33682","background":"#fdf6e3","error":"#dc322f","focusRing":"#268bd2","foreground":"#657b83","info":"#2aa198","muted":"#eee8d5","mutedForeground":"#93a1a1","primary":"#268bd2","secondary":"#6c71c4","selection":"#268bd2","success":"#859900","warning":"#b58900"}},
  // https://github.com/rose-pine/palette (palette.json, dawn) - MIT per package.json (no LICENSE file), Rose Pine
  {"name":"Rosé Pine Dawn","slug":"rose-pine-dawn","colors":{"accent":"#d7827e","background":"#faf4ed","error":"#b4637a","focusRing":"#907aa9","foreground":"#464261","info":"#56949f","muted":"#f2e9e1","mutedForeground":"#9893a5","primary":"#286983","secondary":"#907aa9","selection":"#286983","success":"#286983","warning":"#ea9d34"}},
  // https://github.com/kepano/flexoki (README.md palette, light: paper, black, *-600) - MIT, Copyright (c) 2023 Steph Ango
  {"name":"Flexoki Light","slug":"flexoki-light","colors":{"accent":"#5e409d","background":"#fffcf0","error":"#af3029","focusRing":"#66800b","foreground":"#100f0f","info":"#24837b","muted":"#f2f0e5","mutedForeground":"#6f6e69","primary":"#bc5215","secondary":"#a02f6f","selection":"#bc5215","success":"#66800b","warning":"#ad8301"}},
  // https://github.com/ayu-theme/ayu-colors (npm ayu 9.1.0, dist/generated/light.js) - MIT, Copyright (c) Konstantin Pschera
  {"name":"Ayu Light","slug":"ayu-light","colors":{"accent":"#fa8532","background":"#fcfcfc","error":"#e5474f","focusRing":"#22a4e6","foreground":"#5c6166","info":"#55b4d4","muted":"#ebeef0","mutedForeground":"#828e9f","primary":"#22a4e6","secondary":"#a37acc","selection":"#22a4e6","success":"#86b300","warning":"#eba400"}},
  // https://github.com/sainnhe/everforest (autoload/everforest.vim, light medium) - MIT, Copyright (c) 2019 sainnhe
  {"name":"Everforest Light","slug":"everforest-light","colors":{"accent":"#df69ba","background":"#fdf6e3","error":"#f85552","focusRing":"#df69ba","foreground":"#5c6a72","info":"#35a77c","muted":"#efebd4","mutedForeground":"#939f91","primary":"#8da101","secondary":"#3a94c5","selection":"#8da101","success":"#8da101","warning":"#f57d26"}},
  // https://github.com/morhetz/gruvbox (colors/gruvbox.vim, light medium, faded colors) - MIT/X11 per README (no LICENSE file), morhetz
  {"name":"Gruvbox Light","slug":"gruvbox-light","colors":{"accent":"#9d0006","background":"#fbf1c7","error":"#9d0006","focusRing":"#9d0006","foreground":"#3c3836","info":"#8f3f71","muted":"#ebdbb2","mutedForeground":"#928374","primary":"#076678","secondary":"#427b58","selection":"#076678","success":"#79740e","warning":"#b57614"}},
  // https://gitlab.com/WebFreak001/cute-vscode (themes/cute.json 0.0.4: editor, focusBorder, list selection, sideBar, terminal.ansi*) - CC0-1.0, WebFreak001
  {"name":"Cute Pink Light","slug":"cute-pink-light","colors":{"accent":"#ff4574","background":"#ffffff","error":"#cd3131","focusRing":"#ff4574","foreground":"#333333","info":"#0451a5","muted":"#fceaf1","mutedForeground":"#717171","primary":"#ff4574","secondary":"#bc05bc","selection":"#ff7ba2","success":"#00bc00","warning":"#949800"}},
]
