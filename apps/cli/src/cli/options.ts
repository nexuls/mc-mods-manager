import { Command, Option } from 'commander'
import pc from 'picocolors'
import { z } from 'zod'
import { VERSION } from '../version'

export const BrowserMode = z.enum(['auto', 'app', 'tab'])
export type BrowserMode = z.infer<typeof BrowserMode>

/** Options after commander parsed argv. Commander hands every value over as a string or boolean. */
export const CliOptions = z.strictObject({
  dir: z.string().trim().min(1, 'must not be empty').optional(),
  port: z.coerce
    .number<string>()
    .int('must be a whole number')
    .min(0, 'must be between 0 and 65535')
    .max(65535, 'must be between 0 and 65535')
    .optional(),
  open: z.boolean(),
  browser: BrowserMode,
  exitOnClose: z.boolean().default(false),
})
export type CliOptions = z.infer<typeof CliOptions>

/** Default port. If it's taken (and --port wasn't given), a random free port is used instead. */
export const DEFAULT_PORT = 4719

export function createProgram(): Command {
  return new Command('mc-mod')
    .description(
      'Manage the mods and plugins of a Minecraft instance or server from a local web UI.',
    )
    .version(VERSION, '-v, --version', 'print the version')
    .helpOption('-h, --help', 'show this help')
    .option('-d, --dir <path>', 'instance directory to manage (default: $MC_MOD_DIR or cwd)')
    .option('-p, --port <port>', `port to listen on (default: ${DEFAULT_PORT}, or a free one)`)
    .option('--no-open', "don't open a browser, just print the URL")
    .addOption(
      new Option('-b, --browser <mode>', 'how to open the UI')
        .choices(BrowserMode.options)
        .default('auto'),
    )
    .option('--exit-on-close', 'stop the server about a minute after the UI is closed')
    .configureHelp({
      styleTitle: (s) => pc.bold(s),
      styleCommandText: (s) => pc.cyan(s),
      styleOptionText: (s) => pc.green(s),
      styleArgumentText: (s) => pc.yellow(s),
    })
    .configureOutput({ outputError: (s, write) => write(pc.red(s)) })
    .addHelpText(
      'after',
      [
        '',
        pc.bold('Examples:'),
        `  ${pc.dim('$')} mc-mod                       ${pc.dim('# manage the instance in this directory')}`,
        `  ${pc.dim('$')} mc-mod -d ~/servers/survival  ${pc.dim('# manage another directory')}`,
        `  ${pc.dim('$')} mc-mod --no-open -p 4719      ${pc.dim('# over SSH: ssh -L 4719:127.0.0.1:4719 host')}`,
      ].join('\n'),
    )
}

/** Parses argv. Exits with a commander-style error on invalid options. */
export function parseOptions(program: Command, argv: readonly string[]): CliOptions {
  program.parse(argv)
  const parsed = CliOptions.safeParse(program.opts())
  if (parsed.success) return parsed.data
  const issue = parsed.error.issues[0]
  const flag = typeof issue?.path[0] === 'string' ? `--${kebab(issue.path[0])}` : 'options'
  return program.error(`error: invalid ${flag}: ${issue?.message ?? 'invalid value'}`)
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}
