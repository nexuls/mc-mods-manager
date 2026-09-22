import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { ModFileName, TrashId, type TrashItem, type TrashResponse } from '@mc-mod/shared'
import { AppError } from '../errors'
import { removeInside, renameInside, stateDir } from '../instance/paths'
import { disabledName, enabledName } from '../jar/scan'
import type { InstanceService } from './instance'

/** `.mc-mod/trash/`: jars that were removed or replaced by an update. List, restore, delete for good. */
export class TrashService {
  constructor(private readonly deps: { instance: Pick<InstanceService, 'instance'> }) {}

  private dir(): string {
    return path.join(stateDir(this.deps.instance.instance.root), 'trash')
  }

  async list(): Promise<TrashResponse> {
    const dir = this.dir()
    const names = await readdir(dir).catch((err: unknown) => {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return []
      throw err
    })
    const items: TrashItem[] = []
    for (const name of names) {
      const item = await this.read(dir, name)
      if (item) items.push(item)
    }
    items.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt) || a.id.localeCompare(b.id))
    return { items, totalSize: items.reduce((sum, i) => sum + i.size, 0) }
  }

  /** Moves a trashed jar back to the content folder under its old name. */
  async restore(id: string): Promise<{ fileName: string }> {
    const { root, contentDir } = this.deps.instance.instance
    const item = await this.item(id)
    // Enabled and disabled are the same jar to the list, so either one blocks the restore.
    for (const name of [enabledName(item.fileName), disabledName(item.fileName)]) {
      if (await stat(path.join(contentDir, name)).catch(() => null)) {
        throw new AppError('CONFLICT', `${name} is already in the folder. Remove it first.`)
      }
    }
    await renameInside(root, path.join(this.dir(), item.id), path.join(contentDir, item.fileName))
    return { fileName: item.fileName }
  }

  async remove(id: string): Promise<{ id: string }> {
    const item = await this.item(id)
    await removeInside(this.deps.instance.instance.root, path.join(this.dir(), item.id))
    return { id: item.id }
  }

  async empty(): Promise<{ removed: number; freedBytes: number }> {
    const { items, totalSize } = await this.list()
    const root = this.deps.instance.instance.root
    for (const item of items) await removeInside(root, path.join(this.dir(), item.id))
    return { removed: items.length, freedBytes: totalSize }
  }

  private async item(id: string): Promise<TrashItem> {
    const item = await this.read(this.dir(), TrashId.parse(id))
    if (!item) throw new AppError('NOT_FOUND', `${id} isn't in the trash`)
    return item
  }

  /** A trash entry, or undefined for anything that isn't a trashed jar (other files are left alone). */
  private async read(dir: string, name: string): Promise<TrashItem | undefined> {
    const id = TrashId.safeParse(name)
    if (!id.success) return undefined
    const dash = name.indexOf('-')
    const fileName = ModFileName.safeParse(name.slice(dash + 1))
    const trashedAt = new Date(Number(name.slice(0, dash)))
    if (!fileName.success || Number.isNaN(trashedAt.getTime())) return undefined
    const info = await stat(path.join(dir, name)).catch(() => null)
    if (!info?.isFile()) return undefined
    return {
      id: id.data,
      fileName: fileName.data,
      trashedAt: trashedAt.toISOString(),
      size: info.size,
    }
  }
}
