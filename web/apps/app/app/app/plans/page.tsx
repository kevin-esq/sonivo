import { redirect } from 'next/navigation'
import { routes } from '@/src/routing/routes'

export const metadata = {
  robots: { index: false, follow: false },
}

export default function ProductPlansPage() {
  redirect(routes.accountMembership)
}
