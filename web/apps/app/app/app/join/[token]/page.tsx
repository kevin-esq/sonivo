import { JoinInvitationAppPage } from '@/src/tenancy/JoinInvitationAppPage'

// The .NET static fallback serves the shared shell for arbitrary invitation
// tokens. This placeholder keeps the route in the compatibility export.
export async function generateStaticParams() {
  return [{ token: 'static-export-fallback' }]
}

export default function InvitationRoutePage() {
  return <JoinInvitationAppPage />
}
