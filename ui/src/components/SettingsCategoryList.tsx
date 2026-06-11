import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../tabs/store'
import { getFocusedTab, type ViewSpec } from '../tabs/types'
import { SidebarRow } from './SidebarRow'

type SettingsCategory = Extract<ViewSpec, { kind: 'settings' }>['params']['category']

interface CategoryItem {
  labelKey: string
  category: SettingsCategory
}

const CATEGORIES = [
  { labelKey: 'settings.category.general',     category: 'general' },
  { labelKey: 'settings.category.aiProvider',  category: 'ai-provider' },
  { labelKey: 'settings.category.trading',     category: 'trading' },
  // Connectors moved to its own ActivityBar Legacy entry — see
  // ConnectorsLegacySidebar.
  { labelKey: 'settings.category.mcpServer',   category: 'mcp' },
  { labelKey: 'settings.category.marketData',  category: 'market-data' },
  { labelKey: 'settings.category.newsSources', category: 'news-collector' },
] as const

/**
 * Settings sidebar — flat list of config categories. Click opens (or
 * focuses) the corresponding tab. Active highlight is driven by the
 * currently-focused tab's spec, not by sidebar selection.
 */
export function SettingsCategoryList() {
  const { t } = useTranslation()
  const focused = useWorkspace((state) => getFocusedTab(state)?.spec)
  const openOrFocus = useWorkspace((state) => state.openOrFocus)

  return (
    <div className="py-0.5">
      {CATEGORIES.map((item) => {
        const active =
          focused?.kind === 'settings' && focused.params.category === item.category
        return (
          <SidebarRow
            key={item.category}
            label={t(item.labelKey)}
            active={active}
            onClick={() => openOrFocus({ kind: 'settings', params: { category: item.category } })}
          />
        )
      })}
    </div>
  )
}
