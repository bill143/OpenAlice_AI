import type { ReactElement } from 'react'

interface DemoTerminalStubProps {
  readonly label: string
}

export function DemoTerminalStub({ label }: DemoTerminalStubProps): ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-8 text-zinc-400">
      <div className="max-w-md text-left space-y-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          {label}
        </div>
        <div className="text-base font-semibold text-zinc-200">
          Agent terminal
        </div>
        <div className="text-sm leading-relaxed text-zinc-400">
          In a real OpenAlice install, this pane is a live PTY running{' '}
          <span className="text-zinc-300">Claude Code</span>,{' '}
          <span className="text-zinc-300">Codex</span>, or{' '}
          <span className="text-zinc-300">shell</span> — the AI agent drives it directly: reads files, runs commands, reports back.
        </div>
        <div className="text-xs text-zinc-500">
          Demo mode shows the workspace structure without a live process.
        </div>
        <div className="pt-2">
          <a
            href="https://github.com/TraderAlice/OpenAlice"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:underline"
          >
            Install OpenAlice locally →
          </a>
        </div>
      </div>
    </div>
  )
}
