import { redirect } from 'next/navigation'
import { routes } from '@/src/routing/routes'

export default function LegacyRegisterPage() {
  redirect(routes.register)
}
