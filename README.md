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

Early. The extractor handles a React Router client whose routes, API calls and settings reads follow
consistent patterns. API calls are nodes of their own next to screens. Playwright, JUnit XML and Vitest
JSON results attach to screens and calls through tags in their test names, and check scripts attach
through the verdict lines they print. A review loop (a person marks gaps on the map, a coding agent writes
the missing tests and regenerates the map) is planned but not built.

## Usage

```bash
npm install
npm run rebuild -- path/to/project-config.json   # map.json + tests.json
npm run extract -- path/to/project-config.json   # map.json only
npm test
```

Requires Node 22 or later.

The project config lives **outside this repository** next to the target project's data. Paths in it are
relative to the config file, except the files inside the client source (`routesFile`, `constants`,
`apiModules`), which are relative to `srcRoot`. It names:

- `srcRoot`, `routesFile`, `routeElements`, `routeConstant` — the client source and how routes are declared
- `constants`, `constantStubs` — modules evaluated for route paths and API endpoint definitions, and
  stand-in source for outside packages they import
- `apiModules`, `passThroughCalls` — where API functions live and which wrappers pass a URL through
- `settingsRoots` — identifiers through which settings are read
- `roleIdentifiers` — identifiers that hold the user's role (optional, default none); a guard that uses one
  of them as a whole identifier is a role condition
- `redirectElements`, `entryPaths` — how fallback redirects are declared in the routes file (default
  `Redirect`), and route paths of further screens users start from when the code does not show them
- `serverEndpoints`, `apiPathPrefix` — one or more server endpoint lists
  (`<label>\t<METHOD>\t<path>` per line, `{var}` for path variables)
- `tests` — test results to attach, each `{ "format": <playwright|junit|vitest|verdict>, "path": <file or folder>, "depth": <ui|api|render|code|data> }`.
  A folder is searched for `.json` files (Playwright, Vitest), `.xml` files (JUnit) or `.txt` and `.log`
  files (verdict); files in another format are skipped
- `outDir` — where `map.json` and `tests.json` are written (default: the config's folder)

`map.json` lists screens with their route guards, the API calls reachable from each screen with the
server match, the settings each screen reads, and links to other screens with the conditions guarding
them. Each screen has an ID made of its route path and component name (`/document/:id#DocumentDetail`),
with spaces and `, ( ) & | !` replaced so it works as a JUnit tag too. Routes that end up with the same
ID are listed under `duplicateIds`.

Each API call is also a node under `calls`, with an ID of the form `<METHOD>:<path>`
(`GET:/api/v1/document/{documentId}`). The server match decides the path:

- `match` — the path as written in the server endpoint list, also kept as `server.path`, with the
  endpoint list labels in `server.labels`
- `method-mismatch` — the client's method with the server path (`server.path`); the server's entries are
  in `server.candidates`
- `none` — the client's URL without `apiPathPrefix`, starting with `/`
- `unresolved` — the URL cannot be computed from the source, so there is no call node

When several server paths fit one call, the one whose path variables and fixed names line up with the
client URL wins, then the first in sorted order. The same character replacement as for screen IDs applies.
Each call node lists its `method`, `path`, `server` match, the API functions that make it and the screens
that reach it. Every endpoint under `apiFunctions` carries the `callId` of its node (`null` when unresolved),
and a screen is marked `dead: true` when it reaches a call whose server match is `none`. An unresolved call
alone does not make a screen dead.

Each screen's `access` says whether it opens only under a setting or a role. A guard that reads a member of
a `settingsRoots` identifier is a `setting` condition, one that uses a `roleIdentifiers` identifier is a
`role` condition (it can be both), and any other guard (UI state such as `selected.length > 0`) does not
block. The walk starts from entry screens, listed under `entries` with their `reasons`: the targets of
redirects in the routes file that no setting or role guards (`redirect`), screens no link leads to (`no-incoming-link`, such as pages
opened from an e-mail), and `entryPaths` (`config`; paths that match no route go to `unknownEntryPaths`).
A screen is open when an entry screen reaches it through links and routes without such a guard, and
`restricted` otherwise; a screen no entry screen reaches at all stays open, since nothing shows what would
block it. A link counts as guarded when it has such a guard itself, or when every place that uses the
handler it sits in is guarded. A link enters the route with the
same path, or, when there is none, every route that only adds parameter segments to it (`/document` enters
`/document/:id`); links to a partly unknown path, and a screen's links to itself, are left out. `access`
lists `kinds` (`setting`, `role`), the blocking `route` guards, and every incoming link in `links` with the
screen it comes `from`, its source location, its blocking `guards` (`via` names the handler an inherited
guard came from) and `fromRestricted`.

A test declares the node it covers by putting `@screen:<id>` or `@call:<id>` in its title — for JUnit, in
the test's or the test class's display name (`@DisplayName`), since `@Tag` annotations do not reach the
result XML; for Vitest, in the test title, a `describe` title or the test's `tags` option. A test takes the
depth of its result source unless it carries `@depth:<ui|api|render|code|data>`, which sets the depth for
that test alone. `tests.json` lists the tests per node ID, each with its own depth and status (pass, fail,
pending; skipped and todo count as pending), the tags that point at IDs not on the map or name an unknown
depth, how many tests carry no node tag, and configured result paths that do not exist yet.
`test/fixtures/app` holds a small fake client with example results and a config.

A check script that is not a test framework reports through verdict lines in its output, one test per line;
other lines are ignored:

```
VERDICT empty form save: FIXED — saving an empty form shows a message @screen:/document/:id#DocumentDetail
```

The name runs up to the first `: ` and may contain spaces. The word right after it decides the status:
`UPHOLDS`, `FIXED`, `HEALTHY` pass; `REPRODUCES`, `VIOLATE`, `VIOLATES`, `REGRESSED`, `BROKEN` fail;
`INCONCLUSIVE`, `KNOWN_DROP`, `ENTRY_HEALTHY`, `PARTIAL` and any other word are pending. The text after
`— ` (an em dash; a plain hyphen does not count) is kept as `detail` so the reason for a failure or a
pending result can be shown; for a word outside the table, `detail` is everything after the colon. Node
tags go at the end of the line.

## License

MIT
