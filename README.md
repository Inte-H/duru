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
through the verdict lines they print. A local review page lets a person mark gaps on screens, and a task list
hands the marked screens to a coding agent.

## Usage

```bash
npm install
npm run rebuild -- path/to/project-config.json   # map.json + tests.json
npm run extract -- path/to/project-config.json   # map.json only
node src/cli.mjs review path/to/project-config.json [--port 4400]   # review page on 127.0.0.1, task list when it ends
node src/cli.mjs tasks path/to/project-config.json > tasks.md        # task list for a coding agent
npm test
```

Requires Node 22 or later.

The project config lives **outside this repository** next to the target project's data. Paths in it are
relative to the config file, except the files inside the client source (`routesFile`, `constants`,
`apiModules`, `settingsDefaults`), which are relative to `srcRoot`. It names:

- `srcRoot`, `routesFile`, `routeElements`, `routeConstant` — the client source and how routes are declared
- `constants`, `constantStubs` — modules evaluated for route paths and API endpoint definitions, and
  stand-in source for outside packages they import
- `apiModules`, `passThroughCalls` — where API functions live and which wrappers pass a URL through
- `settingsRoots` — identifiers through which settings are read
- `settingsDefaults` — where the default values of a settings root are written (optional), as
  `{ "globalSettings": { "file": "store/settings.js", "const": "defaults" } }`: the object literal that a
  top-level `const` of that name in the file holds, such as a reducer's initial state. Changes the file makes to
  it afterwards are not seen. The root must also be listed in `settingsRoots`
- `roleIdentifiers` — where the user's role is read (optional, default none): an identifier (`memberRole`) or
  one member of an object (`workspace['member.role']`)
- `redirectElements`, `entryPaths` — how fallback redirects are declared in the routes file (default
  `Redirect`), and route paths of further screens users start from when the code does not show them
- `serverEndpoints`, `apiPathPrefix` — one or more server endpoint lists
  (`<label>\t<METHOD>\t<path>` per line, `{var}` for path variables)
- `tests` — test results to attach, each `{ "format": <playwright|junit|vitest|verdict>, "path": <file or folder>, "depth": <ui|api|render|code|data> }`.
  A folder is searched for `.json` files (Playwright, Vitest), `.xml` files (JUnit) or `.txt` and `.log`
  files (verdict); files in another format are skipped
- `outDir` — where `map.json` and `tests.json` are written (default: the config's folder)
- `marksDir` — folder where review marks are kept (default: `marks` in `outDir`)
- `appUrl` — address of a running instance of the app; the review page links each screen without path
  variables to it

`map.json` lists screens with their route guards, the API calls reachable from each screen with the
server match, the settings each screen reads, and links to other screens with the conditions guarding
them. A screen reaches the files its route component imports, directly or in turn, and the files of every
component that wraps its route in the routes file, such as a layout with a side menu around a group of
routes. The wrapper's API calls, settings reads and links therefore belong to each screen it wraps. A guard
around the wrapper is a route guard of every screen inside it, so the wrapper's links count as coming from
restricted screens and do not repeat that guard.

A menu built from a settings list, where the route is picked by the first parameter of a `forEach` or
`map` callback over the list (`MENUS.ADMIN?.LIST?.forEach((menu) => ... Option.ROUTE_PATH[menu])`), gives one
link per entry of the list's default value when the list is read from a `settingsDefaults` root, directly or
through local consts. Each of these links also carries the setting guard
`globalSettings.SYSTEM.MAIN_MENU.ADMIN.LIST includes 'ADMIN_REPORT'`. Entries that are not route names are
skipped, and a route picked by any other computed key is left out.

Each screen has an ID made of its route path and component name (`/document/:id#DocumentDetail`),
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
a `settingsRoots` identifier is a `setting` condition, one that reads a `roleIdentifiers` entry is a `role`
condition (it can be both), and any other guard (UI state such as `selected.length > 0`) does not block. An
identifier entry matches as a whole identifier. An object entry matches only a read of that member:
`workspace['member.role']` also matches `workspace?.['member.role']` and the double-quoted form, a key that is a
plain name matches the dot form too (`session.role`, `session?.role`), and `workspace['member.id']` does not match.
A `const` declared in the same file that a guard uses is judged by its initializer too, and so are
the consts that initializer uses in turn: after `const isAdmin = isAdminRole(memberRole)`, the guard
`isAdmin` is a role condition and is still listed as `isAdmin`. The walk starts from entry screens, listed under `entries` with their `reasons`: the targets of
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

## Review page

`review` serves a local page that reads `map.json` and `tests.json` from `outDir` (run `rebuild` first) and
writes only into the marks folder. The left column lists the screens with a "no tests" filter, the middle shows the
chosen screen's tests grouped by depth, and the right holds the mark form, the screen's source location,
route guards, links and settings reads.

A mark targets a screen or one depth row of a screen and records a status (`needs-more`, `missing`,
`fine`), a note, the author and the date. The author is `git config user.name` on the machine serving the
page; when it is not set, the page asks for a name. Marks are never overwritten: marking a target again
adds to its history, and the latest mark is its current state.

Each mark is its own file, `<marksDir>/<screen>/<date>-<author>-<short ID>.json`, and saving a mark only
creates a new file. Marks added on two machines therefore never touch the same file and merge in git without
a conflict, and the file list of a pull request reads as which screens were marked, by whom and when. The
screen folder is the screen ID with characters that file names cannot hold replaced by `_`; which screen a
mark belongs to is read from the `target` inside the file, not from the folder. `rebuild` never touches the
marks folder. A mark whose screen is gone from a rebuilt map stays where it is and shows up under
"detached" until someone deals with it.

`review` prints the page address and the marks folder on standard error and keeps running until the review
ends. Pressing 「리뷰 끝」 on the page, or Ctrl+C in the terminal, closes the server, prints the task list on
standard output (the same text as `tasks`, with the marks made during the review) and exits with code 0. A
coding agent that launched the page therefore receives the task list as soon as the reviewer is done. If the
list cannot be built at that moment (a mark file that is not valid JSON, for example), the page or the terminal
shows why and the review keeps running, so it can be ended again once that is fixed. Like
saving a mark, ending the review needs a JSON request to the page's own address, so another site open in the
same browser cannot end it.

## Task list

`tasks` prints, as Markdown on standard output, every screen whose current mark on the whole screen or on
one depth is `needs-more` or `missing`. Marks whose current state is `fine` and detached marks are left out.
Each screen comes with its open marks and notes, the component file and route line, the app address when
`appUrl` is set, the settings and roles it needs and where they are checked, the API calls it makes with
their tests, and the tests already attached with their depth and status. The list starts with how to tag
new tests so that they attach after a `rebuild`. Adding tests does not take a screen off the list; a
reviewer marking it `fine` does. `test/fixtures/app/example-marks` holds example marks for the fake client.

## Agent skill

`skills/duru/SKILL.md` is a skill for a coding agent such as Claude Code. When the user asks for a duru review,
it has the agent rebuild the map, launch `review` and hand the address to the user, write the tests in the
target project from the task list it receives when the review ends, and rebuild again to confirm they attach.
duru itself never calls a model. Install it by copying or symlinking the folder into the project's
`.claude/skills` folder, or into `~/.claude/skills` for every project:

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/duru" ~/.claude/skills/duru   # run from this repository
```

## License

MIT
