import { HelpPage } from '@/src/help/HelpPage'

export const metadata = {
  robots: { index: false, follow: false },
}

export default function ProductHelpPage() {
  return <HelpPage navigationMode="next" />
}
