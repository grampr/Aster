# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Aster UI direction

- Preserve the four-column desktop information architecture: guild rail, channel list, chat, member list.
- Use a light, old-Twitter-inspired visual language: white and near-white surfaces, thin borders, high information density, restrained radius, and minimal shadow.
- Keep the chat as the dominant region and avoid card-heavy, gradient, glass, or decorative layouts.
- Use design tokens and working controls for accent color, message density, column widths, and member-list visibility.
- Use Phosphor icons and real raster assets; do not substitute emoji, text glyphs, CSS art, or handcrafted SVGs for interface assets.
- Collapse the member list first and then the channel list while preserving chat composition and guild navigation.
