# duru (두루)

*Every screen of your app, under every configuration.*

duru computes a screen map of a web client **from its source code** — not by crawling one running
instance or by watching production traffic. That lets it see what observation-based tools cannot:

- **Screens reachable only under certain settings.** Every link and route carries the condition that
  guards it (a feature flag, a system setting, a role), so a screen that only appears when a setting is on
  still shows up, labelled with that setting.
- **Dead screens.** Each screen's API calls are joined with the server's endpoint inventory. A screen
  whose backing endpoint does not exist on the server is reported as dead.
- **Server-side conditions.** Endpoint lists can carry a label (for example a build profile), so a call that
  only works in one build shows up as conditional rather than dead.

It is aimed at products installed per customer with many configurations, where there is no production
traffic to learn from and "every screen under any configuration" is exactly what QA needs to cover.

## Status

Early spike. The first extractor handles a React Router client whose routes, API calls and settings reads
follow consistent patterns. Menus and in-screen buttons, attaching tests to screens, and a review loop
(a person marks gaps on the map, a coding agent writes the missing tests and regenerates the map) are
planned but not built.

## Usage

```bash
npm install
npm run extract -- path/to/project-config.json [out.json]
```

The project config lives **outside this repository** next to the target project's data. It names the
client source root, the routes file, the constants modules to evaluate, the API modules, the identifiers
through which settings are read, and one or more server endpoint lists
(`<label>\t<METHOD>\t<path>` per line, `{var}` for path variables).

Output is a JSON map: screens with their route guards, the API calls reachable from each screen with the
server match, the settings each screen reads, and links to other screens with the conditions guarding them.

## License

MIT
