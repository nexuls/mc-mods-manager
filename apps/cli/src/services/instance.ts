import type { Instance, InstanceOverrides, InstanceResponse } from '@mc-mod/shared'
import { detectInstance } from '../instance/detect'
import { readState, updateState } from '../instance/state'

/** Holds the detected instance for this run; re-detects when the user changes the overrides. */
export class InstanceService {
  private constructor(
    private readonly start: string,
    private current: Instance,
  ) {}

  /** Detects the instance at `start`, applying overrides saved in its state.json. */
  static async load(start: string): Promise<InstanceService> {
    return new InstanceService(start, await InstanceService.detect(start))
  }

  private static async detect(start: string, overrides?: InstanceOverrides): Promise<Instance> {
    // The root is only known after layout resolution, so detect once to find it, then read its state.
    const first = await detectInstance(start, { overrides })
    if (overrides) return first
    const { state, warning } = await readState(first.root)
    if (!state.instance && !warning) return first
    return detectInstance(start, {
      overrides: state.instance,
      warnings: warning ? [warning] : [],
    })
  }

  get instance(): Instance {
    return this.current
  }

  response(): InstanceResponse {
    const { gameVersion, loader } = this.current
    return { instance: this.current, needsSetup: gameVersion === null || loader === null }
  }

  /** Validates the overrides by detecting with them first, then saves them. */
  async setOverrides(overrides: InstanceOverrides): Promise<InstanceResponse> {
    const next = await InstanceService.detect(this.start, overrides)
    await updateState(this.current.root, (s) => ({ ...s, instance: overrides }))
    this.current = next
    return this.response()
  }
}
