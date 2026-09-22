// Version bumps for releases, following npm's `npm version` rules.
import { z } from 'zod'

export const Bump = z.enum([
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
])
export type Bump = z.infer<typeof Bump>

/** `x.y.z` or `x.y.z-id.n` (no build metadata; releases don't use it). */
export const Version = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/, {
    error: 'Expected a version like 1.2.3 or 1.2.3-beta.0',
  })

export const PreId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/i, { error: 'Expected a prerelease id like beta' })

interface Parts {
  major: number
  minor: number
  patch: number
  pre: string[]
}

function parse(version: string): Parts {
  const [core = '', ...rest] = Version.parse(version).split('-')
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number)
  return { major, minor, patch, pre: rest.length ? rest.join('-').split('.') : [] }
}

const format = ({ major, minor, patch, pre }: Parts) =>
  `${major}.${minor}.${patch}${pre.length ? `-${pre.join('.')}` : ''}`

/** The version after `bump`; prerelease bumps use `preid` (`1.2.3` → `1.2.4-beta.0`). */
export function bumpVersion(current: string, bump: Bump, preid = 'beta'): string {
  const v = parse(current)
  const isPre = v.pre.length > 0
  PreId.parse(preid)
  switch (bump) {
    case 'major':
      return format(
        isPre && v.minor === 0 && v.patch === 0
          ? { ...v, pre: [] }
          : { major: v.major + 1, minor: 0, patch: 0, pre: [] },
      )
    case 'minor':
      return format(
        isPre && v.patch === 0
          ? { ...v, pre: [] }
          : { major: v.major, minor: v.minor + 1, patch: 0, pre: [] },
      )
    case 'patch':
      return format(isPre ? { ...v, pre: [] } : { ...v, patch: v.patch + 1 })
    case 'premajor':
      return format({ major: v.major + 1, minor: 0, patch: 0, pre: [preid, '0'] })
    case 'preminor':
      return format({ major: v.major, minor: v.minor + 1, patch: 0, pre: [preid, '0'] })
    case 'prepatch':
      return format({ ...v, patch: v.patch + 1, pre: [preid, '0'] })
    case 'prerelease': {
      if (!isPre) return format({ ...v, patch: v.patch + 1, pre: [preid, '0'] })
      const last = v.pre.at(-1) ?? ''
      if (v.pre[0] === preid && /^\d+$/.test(last)) {
        return format({ ...v, pre: [...v.pre.slice(0, -1), String(Number(last) + 1)] })
      }
      return format({ ...v, pre: [preid, '0'] })
    }
  }
}

/** True when `version` has a prerelease part (`1.0.0-beta.1`). */
export const isPrerelease = (version: string) => parse(version).pre.length > 0
