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

### Installed (`/`)
- Toolbar: search filter, filter chips with counts (All / Disabled / Unidentified / Incompatible / Client-only / Server-side;
  *Updates available* comes with Phase 7), buttons: **Refresh** (looks every jar up again); **Check updates**, **Update all** in Phase 7.
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
- **Link dialog:** possible matches (same mod id, then name search) and a field for a Modrinth URL/slug/id. It can also remove a manual link.
- **Remove** asks first, then moves the jar to `.mc-mod/trash/`.
- Empty state: "No mods yet" (a button to Browse comes with Phase 5).

### Browse (`/browse`)
- Provider tabs: Modrinth | CurseForge (disabled with tooltip + link to Settings if no key).
- Search input (debounced 300ms), sort select, category filter, "Show incompatible" toggle.
- Result cards: icon, title, author, summary, downloads, updated date, client/server side icons,
  **Install** button (or "Installed" / "Update" state if already present).
- Infinite scroll or pagination.

### Project detail (`/project/:provider/:id`)
- Header with icon/title/links, Install button with version dropdown (recommended preselected).
- Tabs: Description (render Markdown/HTML sanitized), Versions (table filtered to compatible by default), Gallery.

### Install confirmation (dialog)
- List of items: main project + required deps (checked, locked), optional deps (unchecked), already-installed (greyed).
- Warnings: incompatible relations, loader fallback ("Fabric build on Quilt"), manual-download-required.
- Progress per item via SSE; toast on completion.

### Export (`/export`)
- Target dir (editable), mode (Copy folder / Zip).
- Three columns or grouped list: **Included** (server/both), **Needs review** (unknown), **Excluded** (client-only).
  Users can move local items and items whose platform doesn't know the side between groups (persists as side override).
- **Export** button → result path + "Open folder".
- Hidden/explained for plugin instances (plugins are already server-only).

### Settings (`/settings`)
- CurseForge API key (password input + Test), default provider, allow pre-releases, export dir name, theme.

## shadcn components expected
button, input, badge, table, dialog, dropdown-menu, select, switch, tabs, tooltip, sonner (toasts),
skeleton, scroll-area, card, separator, alert, progress, field, label, alert-dialog, toggle-group (all installed), plus command (quick search) later.
