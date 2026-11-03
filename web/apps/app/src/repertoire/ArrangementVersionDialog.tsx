import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { ArrangementListItem } from '../api/client'
import { GroupDialog, groupFieldClass } from '../groups/ui'
import { useT } from '../i18n'
import { cn } from '../ui/cn'

export function ArrangementVersionDialog({
  arrangements,
  selectedArrangementId,
  open,
  onClose,
  onSelect,
  title,
  description,
  optionLabel,
  testId,
  optionTestIdPrefix,
}: {
  arrangements: ArrangementListItem[]
  selectedArrangementId: string | null
  open: boolean
  onClose: () => void
  onSelect: (arrangementId: string) => void
  title: string
  description: string
  optionLabel: (label: string) => string
  testId: string
  optionTestIdPrefix: string
}) {
  const { t } = useT()
  const searchId = useId()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])
  const filteredArrangements = useMemo(() => {
    const normalizedQuery = query.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase()
    if (!normalizedQuery) return arrangements
    return arrangements.filter((arrangement) => [arrangement.label, arrangement.defaultKey, arrangement.defaultBpm]
      .filter((value) => value != null)
      .join(' ')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
      .includes(normalizedQuery))
  }, [arrangements, query])

  return (
    <GroupDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      mobileFullscreen
      testId={testId}
    >
      <div className="space-y-3">
        <label className="sr-only" htmlFor={searchId}>{t('song.searchVersions')}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('song.searchVersions')}
            className={`${groupFieldClass} pl-10`}
            data-autofocus
            data-testid={`${optionTestIdPrefix}-search`}
          />
        </div>
        {filteredArrangements.length ? (
          <ul className="max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {filteredArrangements.map((arrangement) => {
              const isSelected = arrangement.id === selectedArrangementId
              const keyAndTempo = [
                arrangement.defaultKey ? `${t('song.infoKey')}: ${arrangement.defaultKey}` : null,
                arrangement.defaultBpm != null ? `${t('song.infoTempo')}: ${arrangement.defaultBpm}` : null,
              ].filter(Boolean).join(' · ')
              return (
                <li key={arrangement.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={optionLabel(arrangement.label)}
                    data-testid={`${optionTestIdPrefix}-select-${arrangement.id}`}
                    onClick={() => {
                      onSelect(arrangement.id)
                      onClose()
                    }}
                    className={cn(
                      'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-border-subtle px-3 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--group-accent)] motion-reduce:transition-none',
                      isSelected ? 'bg-surface-hover' : 'bg-surface',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold text-ink [overflow-wrap:anywhere]">{arrangement.label}</span>
                      <span className="block text-sm text-muted">{keyAndTempo || t('song.noKeyTempo')}</span>
                    </span>
                    {isSelected ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary-ink">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {t('song.versionSelected')}
                      </span>
                    ) : null}
                    {arrangement.isDefault ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary-ink">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {t('song.defaultVersion')}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p role="status" className="rounded-xl bg-surface-hover px-4 py-6 text-center text-sm text-muted">
            {t('song.noVersionSearchResults')}
          </p>
        )}
      </div>
    </GroupDialog>
  )
}
