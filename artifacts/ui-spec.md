# UI spec

Single-page app, desktop-first (it opens in a desktop browser), usable down to ~768px.
shadcn/ui components + Tailwind; light/dark theme following the OS, toggle in header.

## Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ mc-mod  │ 1.21.4 · Fabric 0.16.9 · client  [edit]     ◐  ⚙ Settings │  header: instance badge
├──────────┬────────────────────────────────────────────────────────────┤
│ Installed│                                                            │
│ Browse   │                   view content                             │
│ Export   │                                                            │
│ Settings │                                                            │
└──────────┴────────────────────────────────────────────────────────────┘
```

- Header instance badge opens the **Instance dialog** (change version/loader; shows detection sources).
- If `needsSetup`, the Instance dialog opens automatically and blocks until filled.
- Header right side: server status badge (Connected / Reconnecting / Disconnected; red after `/api/health` fails 3× in a row;
  Not signed in when it answers 401; version in the tooltip; just the dot on phones) and a theme menu (Light / Dark / System).
- **Page states** (App): a navigation + table skeleton while the instance loads; "Couldn't load the instance" with Try again
  when that fails; "Open the link from the terminal" on a 401 (a link from an earlier run). Each page sits in an error
  boundary keyed by path, so a crash shows "This page ran into a problem" (Try again / Reload) and navigating away
  recovers. Empty and error blocks share `PageMessage` (icon, title, text, actions in a dashed box).
- **Scrolling:** every scrolling region (the page below the header, the split view's lists and project page, dialog
  lists) is a `ScrollPanel`: shadcn's scrollbar, plus a soft shadow on each edge the content continues past. The
  header stays put and the page scrolls below it. Native scrollbars that remain (menus, text areas, code blocks) are
  thin with a border-coloured thumb to match.

## Views

### Installed + Browse (`/`, `/browse`)
- One **search bar** above both lists (large, `h-12`): search icon (a spinner while the catalog search runs or the
  debounce waits), a clear button when there is text, and a `Ctrl K` / `⌘K` hint when empty and unfocused.
  `Ctrl+K` / `⌘K`, or `/` outside other inputs, focuses it; Escape clears it, a second Escape leaves it; Enter searches
  right away. The text filters Installed as you type and searches Browse after 300ms. It lives in `?q=`, and the nav
  keeps the query when moving between the two routes.
- **Wide screens (≥ `xl`, 1280px):** both routes show Installed and Browse side by side (unless turned off with the
  columns toggle next to the search bar, remembered in this browser; off, each route shows its own list as below), each with its own scrolling list
  below its title and filters (pagination stays pinned under the results); both nav items are highlighted. Installed
  gets the larger share (5 : 4), Browse at least 26rem. The page is up to 1920px wide. Narrower: each route shows its own
  list, with the same search bar.
- Both lists adapt to their own width (container queries): Installed moves the version into the file-name line below
  768px and drops the Side column below 672px; Browse cards use a smaller icon and title and hide follows below 576px, and the author and
  updated time below 512px.

### Installed (`/`)
- Toolbar: filter chips with counts (All / Updates / Disabled / Unidentified / Incompatible / Client-only / Server-side);
  buttons next to the title: **Refresh** (looks every jar up again), **Check updates** (toast with the count; switches to
  the Updates filter when there are any) and, when the last check found some, **Update all N**.
- Lookup warnings (e.g. Modrinth unreachable) show as an alert above the table.
- Table (shadcn `Table`) with a sticky header (below the app header, or at the top of its pane in the split), sorted by name by default; Name, Source (Modrinth, CurseForge, Local), Side (client, server,
  both, unknown) and Enabled (enabled first) headers sort on click, again to reverse, ties by name A→Z. Columns: icon, name + file name, "Incompatible" badge (reason in a tooltip), "Link conflict"
  badge, version, source chip (translucent brand-colour tint + logo: Modrinth green, CurseForge orange; the second provider's logo
  is added when on both; Local is a quiet grey chip; the tooltip says how it was found),
  side chip (tint + icon: client sky, server violet, both teal, unknown amber; chip text stays the theme foreground).
  A side from Modrinth/CurseForge is read-only (the tooltip names the platform); otherwise (local file, or the platform
  doesn't know) the chip opens a dropdown (Automatic / Client / Server / Both), enabled `Switch`, row menu (Open on
  Modrinth/CurseForge, Updates from ▸ when on both, Update to X, Change version…, Link to project…, Treat as local /
  Identify automatically, Remove…). A green **Update** pill next to the name (new version in its tooltip) opens the update
  dialog for that jar. While the name cell is narrower than 24rem (usual in the split), its badges show only their icon,
  so the name keeps room; the tooltips still name them.
- **Update dialog** (Update all, the row pill, Browse cards, project pages): one row per jar with `old → new` version and
  size, then a progress bar, check or error per row; the footer shows the download size. Files the author only allows
  downloading from the website get a **Download** link and aren't part of the job. All done: toast and close (it stays
  open when there are manual files or failures).
- **Change version dialog:** a select of the project's versions for the instance (date, Recommended/Installed/pre-release
  badges; "Show all versions" adds ones that don't fit, badged and warned about). **Switch version** runs the same job;
  a manual-only file gets a Download button instead.
- **Link dialog:** possible matches from both platforms (same mod id, then name search; provider logo per row) and a field for a
  Modrinth or CurseForge URL/slug/id (platform toggle; CurseForge needs a key). It can also remove a manual link.
- **Remove** asks first, then moves the jar to `.mc-mod/trash/`; the toast has **Undo** (restores it).
- **Trash** button (with the count) opens the Trash dialog: newest first, name, when, size, "disabled"; Restore puts a jar
  back under its old name (refused when the same jar is back); × deletes one for good; Empty trash asks first.
- Empty state: "No mods yet" with a Browse button.

### Browse (`/browse`)
- Provider tabs: Modrinth | CurseForge (provider in the URL; switching clears the category). Without a key the CurseForge tab
  shows a "needs an API key" state with a button to Settings. A pasted CurseForge page URL or project id shows an "Open
  CurseForge project" card above the results, since some keys can't search (the results area then explains that).
- The shared search bar (above), sort select, category filter, "Show incompatible" toggle. The line under the title says
  what the server filtered on ("Showing NeoForge mods for 1.21.1"). All of it lives in the URL.
- Result cards (Modrinth-app style): large icon; title (links to the project page) + "by author"; two-line summary;
  a row of neutral tags: side (with its icon, left out when unknown), up to two categories, then `+N` for the rest
  (loaders included, listed in a tooltip). On the right: downloads and follows, "updated" time (`Yesterday`), and at
  the bottom the **Install** button, a disabled "Installed" when a jar is identified as that project, or **Update** when
  the last check found an update for it.
- Pagination: 20 per page, Previous/Next with "N results · page X of Y".

### Project detail (`/project/:provider/:id`)
- Opens **over the Browse list only**: in the split view it covers the Browse pane (Installed and the search bar stay as
  they are); below it, it replaces the list. The list stays mounted underneath, and project links carry the list's URL
  params, so **Back to results** returns to the same provider, query, page and scroll position (and to `/` or `/browse`,
  whichever it was opened from). Typing in the search bar goes back to the results. The Browse nav item stays highlighted.
- Header with icon/title/summary, downloads, follows, updated, license, side chip, a platform button and the project's
  links (source, issues, wiki, Discord, donations). CurseForge has no side data, so its side chip is left out. On the right when the pane is wide enough (below it otherwise): version dropdown of compatible versions (recommended
  preselected, pre-releases badged) + Install, or "Installed" with the file name (**Update to X** when there's an update).
- Tabs: Description (Markdown/HTML, sanitized), Versions (table, compatible by default, "Show all versions" switch;
  Install per row, which warns in the dialog if the version doesn't fit; "Manual download" badge on files the author only
  allows downloading from the website), Gallery (only when there are images).
- The page sends no referrer (`<meta name="referrer" content="no-referrer">`), since image hosts like imgur block localhost referrers.

### Install confirmation (dialog)
- List of items: main project + required deps (checked, locked), optional deps (unchecked), already-installed and
  unavailable ones (greyed, with the reason). Each row: icon, title, role badge, version, note ("Fabric build"),
  which items need it, side chip. Footer shows the download size.
- Warnings above the list: incompatible relations, dependencies without a fitting version, a hand-picked version that
  doesn't fit, dependencies that must be downloaded by hand.
- Manual items (author disabled third-party downloads on CurseForge): unticked and greyed, with a **Download** button to the
  file's page. If the main project is manual, the description says to download it into the mods folder, and its
  dependencies can still be installed.
- Progress per item via SSE (bar while downloading, check or error when done). All done: toast and close. Any
  failure: toast, and the dialog stays open with the errors and a Close button.

### Export (`/export`)
- Folder name (defaults to the Settings value, applies to this export), format (Folder / Zip), and for Folder a
  **Remove earlier exports** switch (on by default).
- Grouped list: **Included** (server/both), **Needs review** (unknown, only when there are any), **Excluded**
  (client-only and disabled). Included and review rows have a checkbox to leave a jar out of this export. The side
  chip is the Installed side menu, so local items and items whose platform doesn't know the side can be moved for
  good (side override).
- **Export N mods** → confirmation only when a clean copy would remove old jars, then the result path + "Open folder"
  (a toast gives the path when no file manager can be opened).
- The nav item is hidden for plugin instances; `/export` explains that plugins are already server-only.

### Share (`/share`)
- Two cards: **Export the list** (a button that saves `mc-mod-<loader>-<version>-<date>.json`, then says
  what was written) and **Import a list** (a button opening the file picker; the file is parsed with
  `ModList` in the browser before anything is sent).
- The import dialog shows where the list came from (date, mc-mod version), the list's instance next to
  this one (game version, loader, loader version, Java — differences in amber), the plan's warnings, and
  every listed mod.
- Rows are ticked by default; already-installed, local, unavailable and manual ones are locked with a
  badge (manual keeps a **Download** link). Unticking leaves a mod out.
- **Install N mods** runs the normal install job with per-item progress, then closes on success.

### Settings (`/settings`)
- Cards: **CurseForge** (key status badge, password input; Save tests the key first; Test; Remove key; a note when
  `CURSEFORGE_API_KEY` overrides it; says when a working key can't search), **Preferences** (preferred provider, allow
  pre-releases, server export folder name), **Appearance** (theme, stored in the browser). The config file path is shown
  at the bottom. Settings is also a nav item; the header instance button uses a pencil icon.

## shadcn components expected
button, input, badge, table, dialog, dropdown-menu, select, switch, tabs, tooltip, sonner (toasts),
skeleton, scroll-area, card, separator, alert, progress, field, label, alert-dialog, toggle-group, checkbox (all installed), plus command (quick search) later.
