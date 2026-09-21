import { homedir } from 'node:os'
import { intro, log, note, outro } from '@clack/prompts'
import pc from 'picocolors'
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

export function ready(info: { dir: string; url: string; portFallback?: number }): void {
  const rows: [string, string][] = [
    ['Directory', tildify(info.dir)],
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
