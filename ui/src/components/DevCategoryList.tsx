import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab, type ViewSpec } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

type DevTab = Extract<ViewSpec, { kind: 'dev' }>['params']['tab']

interface CategoryItem {
  labelKey: string
  tab: DevTab
}

const CATEGORIES = [
  { labelKey: 'common.tools', tab: 'tools' },
  { labelKey: 'dev.snapshots', tab: 'snapshots' },
  { labelKey: 'common.logs', tab: 'logs' },
  { labelKey: 'simulator.title', tab: 'simulator' },
] as const

/**
 * Dev sidebar — click opens (or focuses) the corresponding dev tab. Active
 * highlight is driven by the focused tab's spec.
 */
export function DevCategoryList() {
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)
  const { t } = useTranslation()

  return (
    <div className="py-0.5">
      {CATEGORIES.map((item) => {
        const active = focused?.kind === 'dev' && focused.params.tab === item.tab
        return (
          <SidebarRow
            key={item.tab}
            label={t(item.labelKey)}
            active={active}
            onClick={() => openOrFocus({ kind: 'dev', params: { tab: item.tab } })}
          />
        )
      })}
    </div>
  )
}
