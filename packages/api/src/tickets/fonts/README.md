# Ticket artwork fonts

Noto Sans, Noto Serif, and Noto Sans Mono Regular are bundled for Vietnamese
ticket labels, headings, and admission codes. The renderer turns their glyphs
into SVG paths so PNGs do not depend on fonts installed on the deployment host.

Source: [Noto fonts](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf).
These unmodified fonts are distributed under the SIL Open Font License in
[OFL.txt](./OFL.txt). Include the three TTF files in server deployment traces.
