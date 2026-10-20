import { redirect } from 'next/navigation'
import { routes } from '@sonivo/routes'

export default function RootPage() {
  redirect(routes.marketingLocale('es'))
}
