// Starts the development servers.
//
// With tmux: one session (`mc-mod`) with a window per app (`cli`, `web`). Re-running attaches to the
// existing session. Without tmux (or with --no-tmux): runs both apps in this terminal via `bun --filter`.
//
//   bun run dev              start or attach
//   bun run dev --no-tmux    force plain mode
//   bun run dev --kill       stop the tmux session

import path from 'node:path'

const SESSION = 'mc-mod'
const root = path.resolve(import.meta.dir, '..')
const apps = [
  { window: 'cli', cwd: path.join(root, 'apps/cli') },
  { window: 'web', cwd: path.join(root, 'apps/web') },
]

const args = new Set(process.argv.slice(2))
const tmux = Bun.which('tmux')

function run(cmd: string[]): number {
  return Bun.spawnSync(cmd, { stdio: ['inherit', 'inherit', 'inherit'] }).exitCode
}

function tmuxOk(...cmd: string[]): boolean {
  return Bun.spawnSync(['tmux', ...cmd], { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0
}

if (args.has('--kill')) {
  if (tmux && tmuxOk('has-session', '-t', `=${SESSION}`)) {
    tmuxOk('kill-session', '-t', `=${SESSION}`)
    console.log(`Stopped tmux session "${SESSION}".`)
  } else {
    console.log(`No tmux session "${SESSION}" running.`)
  }
  process.exit(0)
}

if (!tmux || args.has('--no-tmux')) {
  process.exit(run(['bun', 'run', '--filter', './apps/*', 'dev']))
}

if (!tmuxOk('has-session', '-t', `=${SESSION}`)) {
  const [first, ...rest] = apps
  if (!first) throw new Error('No apps configured')

  tmuxOk('new-session', '-d', '-s', SESSION, '-n', first.window, '-c', first.cwd, 'bun run dev')
  for (const app of rest) {
    tmuxOk('new-window', '-t', `=${SESSION}:`, '-n', app.window, '-c', app.cwd, 'bun run dev')
  }
  // Keep a window open after its process exits, so crash output stays readable.
  for (const app of apps) {
    tmuxOk('set-option', '-w', '-t', `=${SESSION}:${app.window}`, 'remain-on-exit', 'on')
  }
  tmuxOk('select-window', '-t', `=${SESSION}:${first.window}`)
  console.log(`Started tmux session "${SESSION}" (windows: ${apps.map((a) => a.window).join(', ')}).`)
}

// Inside tmux, switch the current client instead of nesting a session.
process.exit(
  run(
    process.env.TMUX
      ? ['tmux', 'switch-client', '-t', `=${SESSION}`]
      : ['tmux', 'attach-session', '-t', `=${SESSION}`],
  ),
)
