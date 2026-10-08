import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'

/**
 * Canonical musical-role tags (voice/instrument). Values are stable English keys
 * stored in `Membership.MusicalRole` (comma-separated); the UI localizes them, so
 * the data never carries a language ("no Spanglish" in stored identifiers).
 */
export const MUSICAL_ROLE_PRESETS = [
  'vocals',
  'choir',
  'guitar',
  'bass',
  'drums',
  'keys',
  'piano',
  'violin',
  'winds',
  'percussion',
  'sound',
] as const

const PRESET_KEYS: Record<string, I18nKey> = {
  vocals: 'musicalRole.vocals',
  choir: 'musicalRole.choir',
  guitar: 'musicalRole.guitar',
  bass: 'musicalRole.bass',
  drums: 'musicalRole.drums',
  keys: 'musicalRole.keys',
  piano: 'musicalRole.piano',
  violin: 'musicalRole.violin',
  winds: 'musicalRole.winds',
  percussion: 'musicalRole.percussion',
  sound: 'musicalRole.sound',
}

export function parseMusicalRoles(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Localized label for a stored tag (falls back to the raw value for legacy free text). */
export function musicalRoleLabel(tag: string, t: (key: I18nKey) => string): string {
  return PRESET_KEYS[tag] ? t(PRESET_KEYS[tag]!) : tag
}

export function musicalRolesText(value: string | null | undefined, t: (key: I18nKey) => string): string {
  return parseMusicalRoles(value).map((tag) => musicalRoleLabel(tag, t)).join(' · ')
}

/** Multi-select tags for a member's voice/instrument roles. */
export function MusicalRoleChips({
  value,
  disabled,
  onChange,
}: {
  value: string | null | undefined
  disabled?: boolean
  onChange: (next: string) => void
}) {
  const { t } = useT()
  const selected = parseMusicalRoles(value)

  function toggle(tag: string) {
    const next = selected.includes(tag)
      ? selected.filter((item) => item !== tag)
      : [...selected, tag]
    onChange(next.join(','))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-ink">{t('musicalRole.title')}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('musicalRole.title')}>
        {MUSICAL_ROLE_PRESETS.map((tag) => {
          const active = selected.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(tag)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60',
                active
                  ? 'border-primary bg-primary/12 text-primary-ink'
                  : 'border-border-subtle text-muted hover:border-primary/30 hover:text-ink',
              )}
            >
              {t(PRESET_KEYS[tag]!)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
