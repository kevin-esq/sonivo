import { useEffect, useState } from 'react'
import { getBillingOrganizations, getPaymentProviderStatus } from '../api/billing'

export function useGroupCreationAvailability() {
  const [canCreateGroup, setCanCreateGroup] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void getPaymentProviderStatus().then(async provider => {
      if (provider.provider !== 'stripe') return true
      const organizations = await getBillingOrganizations()
      return organizations.some(organization => organization.canCreate)
    }).then(value => {
      if (active) { setCanCreateGroup(value); setLoading(false) }
    }).catch(() => {
      if (active) { setCanCreateGroup(false); setLoading(false) }
    })
    return () => { active = false }
  }, [])

  return { canCreateGroup, loading }
}
