# Playwright MCP Setup

## What was configured

A workspace-level MCP configuration has been added at:

- `.vscode/mcp.json`

It points to the official Microsoft Playwright MCP server:

- package: `@playwright/mcp@latest`

It also uses a dedicated config file at:

- `prototype/playwright-mcp.config.json`

## Why this is useful here

Playwright MCP can help inspect and interact with the running prototype UI using browser automation and structured snapshots. For this project, that is useful for:

- checking truck sizing and spacing
- validating filter behaviour
- comparing UI states after changes
- using the optional `vision` capability for coordinate-based interaction when needed

## Next steps in VS Code

1. Reload the VS Code window.
2. Ensure MCP servers are enabled in your editor.
3. Confirm the `playwright` MCP server appears.
4. If prompted, allow the server to start.

## Browser prerequisite

If Playwright reports that the browser is not installed, run this from `prototype/`:

```bash
npx playwright install chromium
```

## Current config choices

- `chromium`
- headed mode (`headless: false`) for easier UI inspection
- viewport `1440x960`
- capabilities: `core`, `vision`
- output directory: `prototype/vision-output`

## Notes

- This setup is aimed at **interactive local UI review**, not CI.
- If headed mode causes issues, switch `headless` to `true` in `prototype/playwright-mcp.config.json`.
- The official docs suggest MCP is good for persistent exploratory loops, while Playwright CLI can be more token-efficient for some agent workflows.
