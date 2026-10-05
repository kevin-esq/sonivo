import { notFound } from 'next/navigation'
import { AttendanceTracker } from '@/components/AttendanceTracker'
import { isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'

export default async function RepertoirePage({
  params,
}: {
  params: Promise<{ tenant: string; locale: string }>
}) {
  const { tenant, locale } = await params
  if (!isLocale(locale)) notFound()

  const dictionary = await getDictionary(locale)
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">{dictionary['tenant.repertoireTitle']}</h1>

      {/* Client component example (i18n + live theme). Real group/event ids come
          from the .NET API; this renders the interactive shell. */}
      <AttendanceTracker groupId={tenant} eventId="example" initial={[]} />
    </main>
  )
}
