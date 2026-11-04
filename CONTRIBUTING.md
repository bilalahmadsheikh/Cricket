# Contributing

1. Clone the repo and run `npm start`. The app is then at http://localhost:8080.
2. Make your change. There's no build step: edit the files in `js/` and `css/` and reload the page.
3. Run `npm test` and make sure every test passes.
4. Open a pull request against `main`.

## Guidelines

- **Dependencies.** Keep the app free of runtime dependencies. If you need a library, load it from a CDN with a pinned version.
- **Data files.**
  - New fielding positions go in `js/positions.js`. Include voice aliases.
  - New fields and traps go in `js/presets.js`. Each one needs exactly 9 position ids and must respect the leg-side rule.
  - New pitches, shots and plans go in `js/conditions.js`.
- **Simulation changes.** If you change the engine, rerun the calibration tests. Explain any shift in the calibration figures in your PR.
- **Voice commands.** Add every new command phrase to the parser tests and to `docs/voice-commands.md`.
