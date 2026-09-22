import { homedir } from 'node:os'
import path from 'node:path'
import { intro, log, note, outro, spinner } from '@clack/prompts'
import { type Instance, type InstanceResponse, loaderInfo } from '@mc-mod/shared'
import pc from 'picocolors'
import { isInside } from '../instance/paths'
import type { Opened } from './browser'

// All human-facing terminal output goes through here, so the CLI looks consistent.

export function banner(version: string, dev: boolean): void {
  const tag = dev ? ` ${pc.bgYellow(pc.black(' dev '))}` : ''
  intro(`${pc.bgGreen(pc.black(' mc-mod '))} ${pc.dim(`v${version}`)}${tag}`)
}

export function devWarning(): void {
  log.warn(
    `Dev mode: session token and Host checks are ${pc.bold('off')}. Use the Vite dev server for the UI.`,
  )
}

export function detecting() {
  const s = spinner()
  s.start('Detecting the instance…')
  return s
}

/** `NeoForge 21.1.250 · Minecraft 1.21.1 · client` */
export function describeInstance(i: Instance): string {
  const loader = i.loader
    ? `${loaderInfo[i.loader].label}${i.loaderVersion ? ` ${i.loaderVersion}` : ''}`
    : pc.yellow('unknown loader')
  const game = i.gameVersion ? `Minecraft ${i.gameVersion}` : pc.yellow('unknown version')
  return [loader, game, i.kind].join(pc.dim(' · '))
}

export function detected(s: ReturnType<typeof spinner>, r: InstanceResponse): void {
  s.stop(pc.bold(describeInstance(r.instance)))
  const [best] = r.instance.detection.filter((d) => d.fields.length > 0)
  if (best) log.message(pc.dim(`from ${best.source}, ${best.confidence} confidence`))
  for (const w of r.instance.warnings) log.warn(w)
  if (!r.needsSetup) return
  const n = r.instance.suggestions.length
  const hint = n > 0 ? ` ${n} installed version${n === 1 ? '' : 's'} can be picked from.` : ''
  log.warn(`Could not tell the game version or loader. Pick them in the UI.${hint}`)
}

/** A non-fatal problem, e.g. an unreadable config file. */
export function warning(message: string): void {
  log.warn(message)
}

export function ready(info: { instance: Instance; url: string; portFallback?: number }): void {
  const { root, contentDir } = info.instance
  const rows: [string, string][] = [
    ['Instance', tildify(root)],
    [
      'Content',
      isInside(root, contentDir) ? `${path.relative(root, contentDir)}/` : tildify(contentDir),
    ],
    ['URL', pc.cyan(pc.underline(info.url))],
  ]
  const width = Math.max(...rows.map(([k]) => k.length))
  note(rows.map(([k, v]) => `${pc.dim(k.padEnd(width))}  ${v}`).join('\n'), 'Ready')
  if (info.portFallback !== undefined) {
    log.info(pc.dim(`Port ${info.portFallback} was busy, so a free port was picked.`))
  }
}

export function opened(result: Opened): void {
  switch (result.kind) {
    case 'app':
      log.success(`Opened in ${result.browser} ${pc.dim('(app window)')}`)
      break
    case 'tab':
      log.success('Opened in your browser')
      break
    case 'failed':
      log.warn(`Couldn't open a browser (${result.reason}). Open the URL above yourself.`)
      break
  }
}

export function waiting(exitOnClose: boolean): void {
  const hint = exitOnClose ? ', or close the UI' : ''
  log.message(pc.dim(`Press ${pc.bold('Ctrl+C')} to stop${hint}.`), { symbol: pc.dim('│') })
}

export function stopped(reason: string): void {
  outro(`${reason} ${pc.dim('Bye!')}`)
}

export function fatal(message: string, hint?: string): void {
  log.error(hint ? `${message}\n${pc.dim(hint)}` : message)
  outro(pc.red('mc-mod did not start.'))
}

export function internalError(err: unknown): void {
  log.error(pc.red(err instanceof Error ? (err.stack ?? err.message) : String(err)))
}

function tildify(p: string): string {
  const home = homedir()
  return p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p
}
