import { notFound } from 'next/navigation'
import { isLocale } from '@sonivo/i18n/config'
import { getDictionary } from '@sonivo/i18n/dictionaries'

export default async function RehearsalsPage({
  params,
}: {
  params: Promise<{ tenant: string; locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const dictionary = await getDictionary(locale)
  return (
    <main>
      <h1 className="text-2xl font-bold">{dictionary['tenant.rehearsalsTitle']}</h1>
    </main>
  )
}
