import { useEffect, useRef } from 'react'
import {
  subscribeGroupData,
  type GroupDataDetail,
  type GroupDataScope,
} from '../../shell/groupEvents'

/**
 * "Real-time" hook for group surfaces (ADR-0074 §3/§6): calls `onChange` when a
 * matching group data slice changes, in this tab (creation dialogs, inline
 * edits) or another tab (the shared broadcast bus). The callback is kept in a
 * ref so callers can pass an inline function without re-subscribing.
 *
 * Because the shared group primitives read the group CSS tokens directly, the
 * theme itself already repaints live; this hook covers *data* freshness.
 */
export function useGroupDataSignal(
  scope: GroupDataScope | GroupDataScope[],
  groupId: string | undefined,
  onChange: () => void,
): void {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const scopeKey = Array.isArray(scope) ? scope.join(',') : scope

  useEffect(() => {
    if (!groupId) return
    const scopes = scopeKey.split(',') as GroupDataScope[]
    return subscribeGroupData((detail: GroupDataDetail) => {
      if (detail.groupId && detail.groupId !== groupId) return
      if (detail.scope === 'all' || scopes.includes(detail.scope)) onChangeRef.current()
    })
  }, [groupId, scopeKey])
}
