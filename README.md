# einstein

爱因斯坦棋 / Einstein chess for
[kwibaka-boardgame-platform](https://github.com/kwibaka-games/boardgame-platform).

- 5×5 cell board, rows 1–5 top to bottom, columns A–E.
- Black starts at A1,A2,A3,B1,B2,C1; white at C5,D4,D5,E3,E4,E5.
- Each side numbers its six pieces 1–6 before play.
- Each turn rolls 1D6 and moves the closest-numbered piece (tie: lower number).
- Black moves right/down/down-right one cell; white moves left/up/up-left one cell.
- Entering an occupied cell captures it, including own pieces.
- Win by reaching E5 (black) / A1 (white), or capturing all opponent pieces.
- Forced target display; no hint toggle.

See the host [game interface](https://github.com/kwibaka-games/boardgame-platform/blob/main/docs/en/interfaces.md).

## Layout

```text
types.ts / game.ts / metadata.ts / worker.ts
web/einstein.js
```

## License

AGPL-3.0-only. See `LICENSE`.
