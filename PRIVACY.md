# Privacy

Fatbeef Plugin Sandbox runs locally in your browser on `https://solanascape.online/play`.

The userscript does not create network requests, phone home, or send diagnostics automatically. Settings are stored in browser local storage for the Solanascape page.

The Diagnostics button copies a redacted compatibility report to your clipboard only when you click it. That report includes client property names, types, array lengths, method names, resolved mapping status, and validation failures. It does not include raw string values, passwords, wallet keys, chat contents, or the raw `gameClient` object.
