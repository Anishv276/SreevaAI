import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/super-admin/', '/api/', '/interview/', '/login/forgot-password'],
    },
    sitemap: 'https://www.sreevaai.com/sitemap.xml',
  }
}
