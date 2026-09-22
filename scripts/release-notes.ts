// Writes the GitHub release notes for a version: Conventional Commits since the previous tag,
// grouped by type, then install instructions for npm and the standalone binaries.
//
//   bun scripts/release-notes.ts 1.2.0 > notes.md
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { isPrerelease, Version } from './lib/semver'

const REPO = 'nexuls/mc-mods-manager'

const { positionals } = parseArgs({ allowPositionals: true })
const [version] = z.tuple([Version]).parse(positionals)
const tag = `v${version}`

function git(...args: string[]): string {
  const r = Bun.spawnSync(['git', ...args], { stderr: 'pipe' })
  return r.exitCode === 0 ? r.stdout.toString().trim() : ''
}

// The newest v* tag reachable from HEAD that isn't this release.
const previous = git('tag', '--merged', 'HEAD', '--sort=-v:refname', '--list', 'v*')
  .split('\n')
  .find((t) => t && t !== tag)

const GROUPS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
] as const
const Commit = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<subject>.+)$/

const lines: string[] = []
if (previous) {
  const log = git('log', `${previous}..HEAD`, '--no-merges', '--format=%h%x1f%s')
  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash = '', subject = ''] = line.split('\x1f')
      return { hash, subject, match: Commit.exec(subject)?.groups }
    })
    .filter((c) => !c.subject.startsWith('chore(release)'))
  const item = (c: (typeof commits)[number]) => {
    const scope = c.match?.scope ? `**${c.match.scope}:** ` : ''
    return `- ${scope}${c.match?.subject ?? c.subject} (${c.hash})`
  }

  const breaking = commits.filter((c) => c.match?.breaking)
  if (breaking.length) lines.push('## Breaking changes', '', ...breaking.map(item), '')
  for (const [type, title] of GROUPS) {
    const group = commits.filter((c) => c.match?.type === type)
    if (group.length) lines.push(`## ${title}`, '', ...group.map(item), '')
  }
  const known = new Set<string>(GROUPS.map(([type]) => type))
  const other = commits.filter((c) => !known.has(c.match?.type ?? ''))
  if (other.length) {
    lines.push(
      '<details><summary>Other changes</summary>',
      '',
      ...other.map(item),
      '',
      '</details>',
      '',
    )
  }
  lines.push(`**Full changelog:** https://github.com/${REPO}/compare/${previous}...${tag}`, '')
} else {
  lines.push('First release.', '')
}

const npmTag = isPrerelease(version) ? `@${version}` : ''
const download = (file: string) =>
  `[\`${file}\`](https://github.com/${REPO}/releases/download/${tag}/${file})`
lines.push(
  '## Install',
  '',
  'With [Bun](https://bun.com) (1.3 or newer):',
  '',
  '```sh',
  `bun add -g mc-mod${npmTag}`,
  '```',
  '',
  'Or download a standalone binary (no Bun needed) and put it on your `PATH`:',
  '',
  '| Platform | File |',
  '|---|---|',
  `| Linux x64 | ${download('mc-mod-linux-x64')} |`,
  `| Linux arm64 | ${download('mc-mod-linux-arm64')} |`,
  `| macOS Apple silicon | ${download('mc-mod-darwin-arm64')} |`,
  `| macOS Intel | ${download('mc-mod-darwin-x64')} |`,
  `| Windows x64 | ${download('mc-mod-windows-x64.exe')} |`,
  '',
  'On Linux and macOS, make it executable first: `chmod +x mc-mod-*`. Checksums are in `SHA256SUMS`.',
  '',
)

console.log(lines.join('\n'))
