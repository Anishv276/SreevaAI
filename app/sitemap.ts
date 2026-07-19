import { MetadataRoute } from 'next'
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.sreevaai.com'
  return [
    {
      url: baseUrl,
      lastModified: new Date('2026-06-04'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${baseUrl}/demo`,
      lastModified: new Date('2026-07-20'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date('2026-04-26'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date('2026-04-26'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ]
}
