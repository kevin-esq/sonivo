import { PlansPage } from '@/src/plans/PlansPage'

export const metadata = {
  robots: { index: false, follow: false },
}

export default function ProductPlansPage() {
  return <PlansPage navigationMode="next" />
}
