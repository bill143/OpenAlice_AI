import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, Hash } from 'lucide-react'
import { entitiesLive } from '../live/entities'
import { useTrackedSelection } from '../live/tracked-selection'

/**
 * Tracked sidebar — the watchlist. A flat list of entities (assets + topics),
 * newest-first, each row showing a type glyph, the kebab name, and how many
 * notes link to it. Selection lives in `useTrackedSelection` so it survives
 * remounts and is read by TrackedPage in the editor area.
 */
export function TrackedSidebar() {
  const { t } = useTranslation()
  const entities = entitiesLive.useStore((s) => s.entities)
  const loading = entitiesLive.useStore((s) => s.loading)
  const selected = useTrackedSelection((s) => s.selectedName)
  const select = useTrackedSelection((s) => s.select)

  // Default-select the first entity once, on first non-empty load. Latch so
  // the user's later picks are never overridden.
  const everSelectedRef = useRef(false)
  useEffect(() => {
    if (everSelectedRef.current) return
    if (entities.length === 0) return
    if (!selected) select(entities[0]!.name)
    everSelectedRef.current = true
  }, [entities, selected, select])

  if (loading && entities.length === 0) {
    return <div className="px-3 py-3 text-[12px] text-text-muted">{t('common.loading')}</div>
  }

  if (entities.length === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-text-muted/70 leading-relaxed">
        {t('tracked.nothingTrackedYet')}
        <div className="mt-1 text-text-muted/50">
          Agents register assets &amp; topics with the{' '}
          <code className="text-[11px]">entity_upsert</code> tool, then link to them with{' '}
          <code className="text-[11px]">[[name]]</code> in their notes.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto py-0.5">
      {entities.map((e) => {
        const active = e.name === selected
        const Icon = e.type === 'asset' ? TrendingUp : Hash
        return (
          <button
            key={e.name}
            type="button"
            onClick={() => select(e.name)}
            title={e.description}
            className={`group relative flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              active ? 'bg-bg-tertiary text-text' : 'text-text hover:bg-bg-tertiary/50'
            }`}
          >
            {active && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />}
            <Icon size={13} strokeWidth={1.75} className="shrink-0 text-text-muted/70" aria-hidden />
            <span className="flex-1 truncate font-mono text-[12px]">{e.name}</span>
            {e.backlinkCount > 0 && (
              <span
                className="shrink-0 text-[10px] text-text-muted/60 tabular-nums"
                title={t('tracked.backlinksTooltip', { count: e.backlinkCount })}
              >
                {e.backlinkCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
