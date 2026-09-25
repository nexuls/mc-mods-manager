import type { LoaderBridgeId } from '@mc-mod/shared'

/**
 * Which compatibility layers are installed in this instance, shared between the scan that finds them
 * and the version picking that acts on them.
 *
 * `LibraryService` fills it on every scan of the content dir; `CatalogService` reads it when it builds
 * a `VersionContext`, which has to be synchronous. Before the first scan it is simply empty, so the
 * worst a cold start does is leave bridged builds out of search filters until the list has loaded.
 */
export class BridgeStore {
  private ids: readonly LoaderBridgeId[] = []

  set(ids: readonly LoaderBridgeId[]): void {
    this.ids = [...ids]
  }

  list(): readonly LoaderBridgeId[] {
    return this.ids
  }
}
