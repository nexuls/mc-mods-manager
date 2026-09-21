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
- Server-disconnected banner if `/api/health` fails 3× in a row.

## Views

### Installed (`/`)
- Toolbar: search filter, filter chips (All / Updates available / Disabled / Unidentified / Client-only / Server-side),
  buttons: **Check updates**, **Update all**, **Refresh**.
- Table (shadcn `Table`): icon, name + file name, version, source badge (Modrinth/CurseForge/Local), side badge
  (editable via dropdown), update available pill, enabled `Switch`, row menu (Open page, Change version, Remove).
- Empty state: "No mods yet" + button to Browse.

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
  Users can move items between groups (persists as side override).
- **Export** button → result path + "Open folder".
- Hidden/explained for plugin instances (plugins are already server-only).

### Settings (`/settings`)
- CurseForge API key (password input + Test), default provider, allow pre-releases, export dir name, theme.

## shadcn components expected
button, input, badge, table, dialog, dropdown-menu, select, switch, tabs, tooltip, sonner (toasts),
skeleton, scroll-area, card, separator, command (quick search), alert, progress.
