import { useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, File, FileText, Image, Link2, Video } from 'lucide-react'
import { apiBlob, resourceContentUrl, type ResourceSummary } from '../api/client'
import { GroupButton, GroupDialog, groupButtonVariants } from '../groups/ui'
import { useT } from '../i18n'
import { safeExternalResourceUrl } from './resourceUrl'
import { isYouTubeLink } from './youtubeRef'
import { ReferenceEmbed } from './ReferenceEmbed'

const PAGE_SIZE = 5
const CATEGORIES = [
  { id: 'documents', label: 'practice.materialCategory.documents', Icon: FileText },
  { id: 'images', label: 'practice.materialCategory.images', Icon: Image },
  { id: 'videos', label: 'practice.materialCategory.videos', Icon: Video },
  { id: 'links', label: 'practice.materialCategory.links', Icon: Link2 },
  { id: 'other', label: 'practice.materialCategory.other', Icon: File },
] as const

type MaterialCategory = 'audio' | (typeof CATEGORIES)[number]['id']

function getCategory(resource: ResourceSummary): MaterialCategory {
  const contentType = resource.contentType?.toLowerCase() ?? ''
  const name = (resource.originalFileName ?? resource.url ?? '').split('?')[0]?.toLowerCase() ?? ''
  if (contentType.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac|webm|opus)$/.test(name)) return 'audio'
  if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|heic)$/.test(name)) return 'images'
  if (contentType.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv)$/.test(name)) return 'videos'
  if (contentType === 'application/pdf' || /\.pdf$/.test(name)) return 'documents'
  if (resource.purpose === 'audio' || resource.purpose === 'click') return 'audio'
  if (resource.kind === 'link') return 'links'
  if (contentType.startsWith('text/') || contentType.startsWith('application/') || /\.(txt|lrc|ttml|chord|crd|docx?|xlsx?|pptx?)$/.test(name)) return 'documents'
  return 'other'
}

function isPdf(resource: ResourceSummary): boolean {
  const name = (resource.originalFileName ?? resource.url ?? '').split('?')[0]?.toLowerCase() ?? ''
  return resource.contentType?.toLowerCase() === 'application/pdf' || name.endsWith('.pdf')
}

export function PracticeMaterials({ groupId, arrangementId, resources }: { groupId: string; arrangementId: string; resources: ResourceSummary[] }) {
  const { t } = useT()
  const [pages, setPages] = useState<Partial<Record<MaterialCategory, number>>>({})
  const [previewResourceId, setPreviewResourceId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ resourceId: string; url: string } | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPreview(null)
    setPreviewFailed(false)
    const resource = resources.find((item) => item.id === previewResourceId)
    if (!resource) return
    if (resource.kind === 'link') {
      if (isYouTubeLink(resource)) return
      const externalUrl = safeExternalResourceUrl(resource.url)
      if (externalUrl) setPreview({ resourceId: resource.id, url: externalUrl })
      else setPreviewFailed(true)
      return
    }

    void apiBlob(resourceContentUrl(groupId, arrangementId, resource.id))
      .then((blob) => {
        if (cancelled) return
        const normalizedBlob = isPdf(resource) && blob.type !== 'application/pdf'
          ? new Blob([blob], { type: 'application/pdf' })
          : blob
        objectUrl = URL.createObjectURL(normalizedBlob)
        setPreview({ resourceId: resource.id, url: objectUrl })
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [arrangementId, groupId, previewResourceId, resources])
  const previewResource = resources.find((resource) => resource.id === previewResourceId) ?? null
  const categories = CATEGORIES.map((category) => ({
    ...category,
    resources: resources.filter((resource) => getCategory(resource) === category.id),
  })).filter((category) => category.resources.length > 0)

  if (categories.length === 0) return null

  return (
    <section className="space-y-4" aria-labelledby="practice-materials-heading" data-testid="practice-materials">
      <h2 id="practice-materials-heading" className="text-lg font-semibold tracking-tight text-ink">{t('practice.materialsTitle')}</h2>
      {categories.map(({ id, label, Icon, resources: categoryResources }) => {
        const pageCount = Math.ceil(categoryResources.length / PAGE_SIZE)
        const page = Math.min(pages[id] ?? 1, pageCount)
        const visibleResources = categoryResources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        return (
          <details key={id} className="group rounded-xl border border-border-subtle bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
                <span className="truncate">{t(label)}</span>
                <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-muted">{categoryResources.length}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <div className="space-y-3 border-t border-border-subtle p-4">
            <ul className="space-y-2">
              {visibleResources.map((resource) => {
                const youtubeLink = id === 'links' && isYouTubeLink(resource)
                const previewable = youtubeLink || id === 'images' || id === 'videos' || (id === 'documents' && isPdf(resource))
                const content = <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{resource.label}</span>
                  <span className="block truncate text-xs text-muted">{resource.originalFileName ?? resource.url ?? resource.contentType ?? resource.kind}</span>
                </span>
                const downloadHref = resource.kind === 'file' ? resourceContentUrl(groupId, arrangementId, resource.id) : null
                const externalHref = resource.kind === 'link' ? safeExternalResourceUrl(resource.url) : null
                return (
                  <li key={resource.id} className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
                    {id === 'links' && !youtubeLink && externalHref ? (
                      <a className="flex min-h-16 min-w-0 items-center gap-3 p-3 no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={externalHref} target="_blank" rel="noopener noreferrer">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-hover text-primary-ink"><Link2 className="h-5 w-5" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{resource.label}</span>
                          <span className="block truncate text-xs text-muted">{new URL(externalHref).hostname}</span>
                          <span className="block truncate text-xs text-muted">{externalHref}</span>
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      </a>
                    ) : previewable ? <div className="flex min-h-14 min-w-0 items-center gap-1 px-3 py-2">
                      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => { setPreviewFailed(false); setPreviewResourceId(resource.id) }} aria-haspopup="dialog" aria-label={`${t('practice.materialPreview')}: ${resource.label}`}>
                        {id === 'links' ? <>
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-hover text-primary-ink"><Link2 className="h-5 w-5" aria-hidden="true" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-ink">{resource.label}</span>
                            <span className="block truncate text-xs text-muted">{externalHref ? new URL(externalHref).hostname : resource.url}</span>
                          </span>
                          <ExternalLink className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        </> : content}
                      </button>
                      {downloadHref ? <a className={`${groupButtonVariants({ variant: 'ghost', size: 'icon' })} shrink-0 sm:w-auto sm:px-3`} href={downloadHref} download aria-label={t('practice.materialDownload')} title={t('practice.materialDownload')}>
                        <Download className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">{t('practice.materialDownload')}</span>
                      </a> : null}
                    </div>
                    : downloadHref ? (
                      <a className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2 no-underline hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={downloadHref} download>
                        {content}<Download className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" /><span className="sr-only">{t('practice.materialDownload')}</span>
                      </a>
                    ) : <div className="flex min-h-14 min-w-0 items-center gap-3 px-3 py-2" aria-disabled="true">{content}</div>}
                  </li>
                )
              })}
            </ul>
            <nav aria-label={t('practice.materialsPagination', { category: t(label) })} className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <span className="text-sm text-muted">{t('songs.pageStatus', { page, pages: pageCount })}</span>
              <div className="flex gap-2">
                <GroupButton variant="secondary" size="icon" disabled={page <= 1} aria-label={t('songs.previousPage')} onClick={() => setPages((current) => ({ ...current, [id]: Math.max(1, page - 1) }))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </GroupButton>
                <GroupButton variant="secondary" size="icon" disabled={page >= pageCount} aria-label={t('songs.nextPage')} onClick={() => setPages((current) => ({ ...current, [id]: Math.min(pageCount, page + 1) }))}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </GroupButton>
              </div>
            </nav>
            </div>
          </details>
        )
      })}
      <GroupDialog
        open={previewResource != null}
        onClose={() => setPreviewResourceId(null)}
        title={previewResource?.label ?? t('practice.materialPreview')}
        description={previewResource?.originalFileName ?? undefined}
        size="xl"
        mobileFullscreen
        testId="practice-material-preview-dialog"
        footer={previewResource && isYouTubeLink(previewResource) && safeExternalResourceUrl(previewResource.url) ? <a className={groupButtonVariants({ variant: 'primary' })} href={safeExternalResourceUrl(previewResource.url)!} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" aria-hidden="true" /><span>{t('practice.openOriginal')}</span>
        </a> : undefined}
      >
        {previewResource ? isYouTubeLink(previewResource) ? <ReferenceEmbed resource={previewResource} showLabel={false} /> : previewResource.kind === 'link' && preview?.resourceId === previewResource.id ? (
          <div className="flex min-h-32 items-start gap-4 rounded-2xl border border-border-subtle bg-surface-hover p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface text-primary-ink"><Link2 className="h-6 w-6" aria-hidden="true" /></span>
            <span className="min-w-0 space-y-1">
              <span className="block font-semibold text-ink">{new URL(preview.url).hostname}</span>
              <span className="block break-all text-sm text-muted">{preview.url}</span>
            </span>
          </div>
        ) : preview?.resourceId === previewResource.id ? (
          getCategory(previewResource) === 'images' ? <img src={preview.url} alt={previewResource.label} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" /> :
          getCategory(previewResource) === 'videos' ? <video src={preview.url} controls preload="metadata" className="max-h-[65vh] w-full rounded-lg bg-black" /> :
          <iframe src={preview.url} title={previewResource.label} className="h-[65vh] w-full rounded-lg border border-border-subtle" />
        ) : previewFailed ? <p role="alert" className="text-sm text-error-ink">{t('practice.materialPreviewError')}</p> : <p role="status" className="text-sm text-muted">{t('practice.materialLoading')}</p> : null}
      </GroupDialog>
    </section>
  )
}
