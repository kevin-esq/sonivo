import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  ConfirmPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from '@/src/shell/VerifyPages'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export const dynamicParams = false

const pages = {
  confirm: ConfirmPage,
  'forgot-password': ForgotPasswordPage,
  'reset-password': ResetPasswordPage,
} as const

export function generateStaticParams() {
  return Object.keys(pages).map((verification) => ({ verification }))
}

export default async function VerificationRoute({
  params,
}: {
  params: Promise<{ verification: string }>
}) {
  const { verification } = await params
  const Page = pages[verification as keyof typeof pages]
  if (!Page) notFound()

  return (
    <Suspense fallback={<main aria-busy="true" />}>
      <Page />
    </Suspense>
  )
}
