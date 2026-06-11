import type { ReactElement } from 'react'

export function DemoBanner(): ReactElement {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/40 text-[12px] text-text shrink-0">
      <span className="shrink-0 inline-flex items-center gap-1.5 font-semibold text-amber-400 uppercase tracking-wider text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Demo
      </span>
      <span className="flex-1 min-w-0 truncate text-text-muted">
        You&apos;re looking at a snapshot of OpenAlice with recorded data. Mutations don&apos;t persist; the agent terminal is replayed.
      </span>
      <a
        href="https://github.com/TraderAlice/OpenAlice"
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber-400 hover:underline shrink-0 font-medium"
      >
        Install →
      </a>
    </div>
  )
}
