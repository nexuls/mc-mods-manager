import {
  type ImportCandidate,
  type ImportItem,
  type ImportStatus,
  type ImportVersionMode,
  importCandidate,
  importStatus,
} from '@mc-mod/shared'

/** Installable first, then the ones that need a hand, then what's already here. */
const statusOrder: Record<ImportStatus, number> = {
  install: 0,
  manual: 1,
  incompatible: 2,
  unavailable: 3,
  local: 4,
  installed: 5,
}

export const statusLabel: Record<ImportStatus, string> = {
  install: 'Install',
  manual: 'Manual download',
  incompatible: "Doesn't fit",
  unavailable: 'Unavailable',
  local: 'Local file',
  installed: 'Installed',
}

/** One listed mod as the dialog shows it, once the version choice has been applied. */
export interface ImportRow {
  item: ImportItem
  status: ImportStatus
  /** The file this row would install, if any. */
  candidate: ImportCandidate | undefined
  /** The line under the title: what's different about this pick, or why nothing can happen. */
  detail: string | undefined
  /** The user may tick it. */
  selectable: boolean
}

/**
 * The rows for a plan under one version choice. `includeIncompatible` is the "install everything"
 * switch: files that don't fit this instance can still be downloaded, they just come with a warning
 * rather than a promise.
 */
export function importRows(
  items: readonly ImportItem[],
  mode: ImportVersionMode,
  includeIncompatible: boolean,
): ImportRow[] {
  const rows = items.map((item): ImportRow => {
    const status = importStatus(item, mode)
    const candidate = importCandidate(item, mode)
    return {
      item,
      status,
      candidate,
      detail: detailOf(item, candidate, status),
      selectable: status === 'install' || (includeIncompatible && status === 'incompatible'),
    }
  })
  return rows.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
}

function detailOf(
  item: ImportItem,
  candidate: ImportCandidate | undefined,
  status: ImportStatus,
): string | undefined {
  if (!candidate) return item.reason ?? item.fileName
  const shared = item.shared
  // Taking another file than the one the list pinned is the thing most worth saying out loud.
  if (shared && candidate.versionId !== shared.versionId) {
    const listed = shared.versionNumber ?? item.listedVersion
    const taking = candidate.versionNumber ?? 'another build'
    const why = shared.compatible ? 'newer than the shared' : "the shared build doesn't fit here;"
    return shared.compatible
      ? `${taking} — ${why} ${listed}`
      : `${why} taking ${taking}${candidate.note ? ` (${candidate.note})` : ''}`
  }
  if (candidate.note) return candidate.note
  if (status === 'incompatible') return item.reason ?? "Doesn't fit this instance"
  return item.reason ?? item.fileName
}
