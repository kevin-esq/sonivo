import { useState } from 'react'
import { X } from 'lucide-react'
import { useT, type I18nKey } from '../i18n'
import { cn } from '../ui/cn'
import { GroupButton, GroupSelect } from './ui'

/**
 * Musical roles as canonical English keys stored in `Membership.MusicalRole`
 * (comma-separated). The UI localizes them, so stored identifiers carry no
 * language. Roles are grouped by category and picked with selects (friendly),
 * with the chosen ones shown as removable chips.
 */
export const MUSICAL_ROLE_CATEGORIES: { id: string; labelKey: I18nKey; presets: readonly string[] }[] = [
  {
    id: 'voice',
    labelKey: 'musicalRole.category.voice',
    presets: ['vocals', 'choir', 'soprano', 'mezzo', 'alto', 'tenor', 'baritone', 'bassVoice'],
  },
  {
    id: 'strings',
    labelKey: 'musicalRole.category.strings',
    presets: ['acousticGuitar', 'electricGuitar', 'bass', 'violin', 'viola', 'cello', 'doubleBass'],
  },
  {
    id: 'keys',
    labelKey: 'musicalRole.category.keys',
    presets: ['piano', 'keys', 'organ', 'synth'],
  },
  {
    id: 'percussion',
    labelKey: 'musicalRole.category.percussion',
    presets: ['drums', 'percussion'],
  },
  {
    id: 'winds',
    labelKey: 'musicalRole.category.winds',
    presets: ['trumpet', 'saxophone', 'trombone', 'flute', 'clarinet', 'tuba', 'horn', 'oboe'],
  },
  {
    id: 'tech',
    labelKey: 'musicalRole.category.tech',
    presets: ['sound', 'director', 'composer'],
  },
  {
    id: 'ops',
    labelKey: 'musicalRole.category.ops',
    presets: [
      'socialMedia',
      'marketing',
      'communication',
      'photography',
      'design',
      'logistics',
      'operations',
      'finance',
    ],
  },
]

const PRESET_KEYS: Record<string, I18nKey> = {
  vocals: 'musicalRole.vocals',
  choir: 'musicalRole.choir',
  soprano: 'musicalRole.soprano',
  mezzo: 'musicalRole.mezzo',
  alto: 'musicalRole.alto',
  tenor: 'musicalRole.tenor',
  baritone: 'musicalRole.baritone',
  bassVoice: 'musicalRole.bassVoice',
  acousticGuitar: 'musicalRole.acousticGuitar',
  electricGuitar: 'musicalRole.electricGuitar',
  bass: 'musicalRole.bass',
  violin: 'musicalRole.violin',
  viola: 'musicalRole.viola',
  cello: 'musicalRole.cello',
  doubleBass: 'musicalRole.doubleBass',
  piano: 'musicalRole.piano',
  keys: 'musicalRole.keys',
  organ: 'musicalRole.organ',
  synth: 'musicalRole.synth',
  drums: 'musicalRole.drums',
  percussion: 'musicalRole.percussion',
  trumpet: 'musicalRole.trumpet',
  saxophone: 'musicalRole.saxophone',
  trombone: 'musicalRole.trombone',
  flute: 'musicalRole.flute',
  clarinet: 'musicalRole.clarinet',
  tuba: 'musicalRole.tuba',
  horn: 'musicalRole.horn',
  oboe: 'musicalRole.oboe',
  sound: 'musicalRole.sound',
  director: 'musicalRole.director',
  composer: 'musicalRole.composer',
  socialMedia: 'musicalRole.socialMedia',
  marketing: 'musicalRole.marketing',
  communication: 'musicalRole.communication',
  photography: 'musicalRole.photography',
  design: 'musicalRole.design',
  logistics: 'musicalRole.logistics',
  operations: 'musicalRole.operations',
  finance: 'musicalRole.finance',
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

/** Category → role selects, with the chosen roles shown as removable chips. */
export function MusicalRolePicker({
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
  const [categoryId, setCategoryId] = useState(MUSICAL_ROLE_CATEGORIES[0]!.id)
  const category = MUSICAL_ROLE_CATEGORIES.find((item) => item.id === categoryId) ?? MUSICAL_ROLE_CATEGORIES[0]!
  const [role, setRole] = useState<string>(MUSICAL_ROLE_CATEGORIES[0]!.presets[0]!)

  function onCategoryChange(next: string) {
    setCategoryId(next)
    const found = MUSICAL_ROLE_CATEGORIES.find((item) => item.id === next)
    setRole(found?.presets[0] ?? '')
  }

  function add() {
    if (!role || selected.includes(role)) return
    onChange([...selected, role].join(','))
  }

  function remove(tag: string) {
    onChange(selected.filter((item) => item !== tag).join(','))
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-ink">{t('musicalRole.title')}</span>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/12 px-2.5 py-1 text-xs font-medium text-primary-ink"
            >
              {musicalRoleLabel(tag, t)}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  aria-label={t('musicalRole.remove')}
                  className={cn('grid h-4 w-4 place-items-center rounded-full hover:bg-primary/20')}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <GroupSelect
          label={t('musicalRole.categoryLabel')}
          value={categoryId}
          disabled={disabled}
          options={MUSICAL_ROLE_CATEGORIES.map((item) => ({ value: item.id, label: t(item.labelKey) }))}
          onChange={onCategoryChange}
        />
        <GroupSelect
          label={t('musicalRole.roleLabel')}
          value={role}
          disabled={disabled}
          options={category.presets.map((preset) => ({ value: preset, label: t(PRESET_KEYS[preset]!) }))}
          onChange={setRole}
        />
      </div>
      <GroupButton
        type="button"
        variant="secondary"
        disabled={disabled || !role || selected.includes(role)}
        onClick={add}
        className="w-full sm:w-auto"
      >
        {t('musicalRole.add')}
      </GroupButton>
    </div>
  )
}
