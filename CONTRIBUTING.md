# Contributing

Thanks for helping improve Solanascape Deck.

Before opening a pull request:

```powershell
npm install
npm run verify
```

Keep changes inside the local-only boundary:

- Do not add network calls.
- Do not synthesize clicks, keys, pointer events, or gameplay input.
- Do not expose the raw game client in diagnostics.
- Prefer stable public `plugin*` getters over obfuscated-field mappings.
- Gate each feature by capability so one broken mapping does not break the whole userscript.

If a Solanascape client update requires mapping changes, update `src/mapping.ts`, `docs/client-state.md`, and relevant tests together.
