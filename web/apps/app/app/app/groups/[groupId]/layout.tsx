import { GroupAppLayout } from './GroupAppLayout'
import type { ReactNode } from 'react'

// The export build needs one concrete parent segment. This reserved marker is
// only a build placeholder; it is never treated as an authorized Group.
export async function generateStaticParams() {
  return [{ groupId: 'static-export-home' }]
}

export default function GroupLayout({ children }: { children: ReactNode }) {
  return <GroupAppLayout>{children}</GroupAppLayout>
}
