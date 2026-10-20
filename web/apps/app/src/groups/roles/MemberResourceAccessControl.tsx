import { Eye, EyeOff } from 'lucide-react'
import type { MemberResourceGrant } from '../../api/client'
import { useT } from '../../i18n'

type ResourceType = MemberResourceGrant['resourceType']

function accessKey(resourceType: ResourceType, resourceId: string) {
  return `${resourceType}:${resourceId}`
}

export function MemberResourceAccessControl({
  resourceType,
  resourceId,
  label,
  values,
  parentRestricted,
  pending,
  onChange,
}: {
  resourceType: ResourceType
  resourceId: string
  label: string
  values: Record<string, boolean | null>
  parentRestricted: boolean
  pending: boolean
  onChange: (resourceType: ResourceType, resourceId: string, value: boolean | null) => void
}) {
  const { t } = useT()
  const key = accessKey(resourceType, resourceId)
  const value = Object.hasOwn(values, key) ? values[key] : null

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {value === false ? (
        <EyeOff className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      ) : (
        <Eye className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      )}
      <label className="sr-only" htmlFor={`access-${resourceType}-${resourceId}`}>
        {t('roles.resourceAccessLabel', { title: label })}
      </label>
      <select
        id={`access-${resourceType}-${resourceId}`}
        value={value === null ? 'inherit' : value ? 'allow' : 'deny'}
        disabled={pending}
        onChange={(event) => {
          const selected = event.target.value
          onChange(resourceType, resourceId, selected === 'inherit' ? null : selected === 'allow')
        }}
        className="min-h-10 max-w-40 rounded-lg border border-border-subtle bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <option value="inherit">{t('roles.resourceAccessInherited')}</option>
        <option value="allow">{t('roles.resourceAccessAllowed')}</option>
        <option value="deny">{t('roles.resourceAccessRestricted')}</option>
      </select>
      {parentRestricted ? (
        <span className="basis-full text-xs text-muted sm:basis-auto">
          {t('roles.resourceAccessParentRestricted')}
        </span>
      ) : null}
    </div>
  )
}
