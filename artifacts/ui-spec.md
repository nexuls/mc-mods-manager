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
- Header right side: server status badge (Connected / Reconnecting / Disconnected; red after `/api/health` fails 3× in a row,
  version in the tooltip) and a theme menu (Light / Dark / System).

## Views

### Installed + Browse (`/`, `/browse`)
- One **search bar** above both lists (large, `h-12`): search icon (a spinner while the catalog search runs or the
  debounce waits), a clear button when there is text, and a `Ctrl K` / `⌘K` hint when empty and unfocused.
  `Ctrl+K` / `⌘K`, or `/` outside other inputs, focuses it; Escape clears it, a second Escape leaves it; Enter searches
  right away. The text filters Installed as you type and searches Browse after 300ms. It lives in `?q=`, and the nav
  keeps the query when moving between the two routes.
- **Wide screens (≥ `xl`, 1280px):** both routes show Installed and Browse side by side, each with its own scrolling list
  below its title and filters (pagination stays pinned under the results); both nav items are highlighted. The page is
  up to 1536px wide. Narrower: each route shows its own list, with the same search bar.
- Both lists adapt to their own width (container queries): Installed moves the version into the file-name line below
  768px and drops the Side column below 576px; Browse cards use a smaller icon and title and hide follows below 576px.

### Installed (`/`)
- Toolbar: filter chips with counts (All / Disabled / Unidentified / Incompatible / Client-only / Server-side;
  *Updates available* comes with Phase 7); buttons next to the title: **Refresh** (looks every jar up again); **Check updates**, **Update all** in Phase 7.
- Lookup warnings (e.g. Modrinth unreachable) show as an alert above the table.
- Table (shadcn `Table`), sorted by name by default; Name, Source (Modrinth, CurseForge, Local), Side (client, server,
  both, unknown) and Enabled (enabled first) headers sort on click, again to reverse, ties by name A→Z. Columns: icon, name + file name, "Incompatible" badge (reason in a tooltip), "Link conflict"
  badge, version, source chip (translucent brand-colour tint + logo: Modrinth green, CurseForge orange; the second provider's logo
  is added when on both; Local is a quiet grey chip; the tooltip says how it was found),
  side chip (tint + icon: client sky, server violet, both teal, unknown amber; chip text stays the theme foreground).
  A side from Modrinth/CurseForge is read-only (the tooltip names the platform); otherwise (local file, or the platform
  doesn't know) the chip opens a dropdown (Automatic / Client / Server / Both), enabled `Switch`, row menu (Open on
  Modrinth/CurseForge, Updates from ▸ when on both, Link to project…, Treat as local / Identify automatically, Remove…).
  *Update available pill* and *Change version* come with Phase 7.
- **Link dialog:** possible matches from both platforms (same mod id, then name search; provider logo per row) and a field for a
  Modrinth or CurseForge URL/slug/id (platform toggle; CurseForge needs a key). It can also remove a manual link.
- **Remove** asks first, then moves the jar to `.mc-mod/trash/`.
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
  the bottom the **Install** button, or a disabled "Installed" when a jar is identified as that project ("Update" comes
  with Phase 7).
- Pagination: 20 per page, Previous/Next with "N results · page X of Y".

### Project detail (`/project/:provider/:id`)
- Back to Browse (the same provider tab); the Browse nav item stays highlighted.
- Header with icon/title/summary, downloads, follows, updated, license, side chip, a platform button and the project's
  links (source, issues, wiki, Discord, donations). CurseForge has no side data, so its side chip is left out. On the right: version dropdown of compatible versions (recommended
  preselected, pre-releases badged) + Install, or "Installed" with the file name.
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
- Target dir (editable), mode (Copy folder / Zip).
- Three columns or grouped list: **Included** (server/both), **Needs review** (unknown), **Excluded** (client-only).
  Users can move local items and items whose platform doesn't know the side between groups (persists as side override).
- **Export** button → result path + "Open folder".
- Hidden/explained for plugin instances (plugins are already server-only).

### Settings (`/settings`)
- Cards: **CurseForge** (key status badge, password input; Save tests the key first; Test; Remove key; a note when
  `CURSEFORGE_API_KEY` overrides it; says when a working key can't search), **Preferences** (preferred provider, allow
  pre-releases, server export folder name), **Appearance** (theme, stored in the browser). The config file path is shown
  at the bottom. Settings is also a nav item; the header instance button uses a pencil icon.

## shadcn components expected
button, input, badge, table, dialog, dropdown-menu, select, switch, tabs, tooltip, sonner (toasts),
skeleton, scroll-area, card, separator, alert, progress, field, label, alert-dialog, toggle-group, checkbox (all installed), plus command (quick search) later.
