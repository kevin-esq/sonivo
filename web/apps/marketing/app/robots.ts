import type { MetadataRoute } from 'next'
import { surfaceUrl } from '@sonivo/routes/hosts'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: surfaceUrl('marketing', '/sitemap.xml'),
  }
}
