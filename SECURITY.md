# Security Policy

Please report security issues privately to the project maintainers before opening a public issue.

Fatbeef Plugin Sandbox should remain a local-only userscript. Reports are especially useful when they show that the built script:

- Creates network requests.
- Dispatches synthetic gameplay input.
- Sends, stores, or exposes private player data.
- Modifies packets or bypasses Solanascape client/server behavior.

Run `npm run audit` before releases to verify the intended runtime boundary.
