# Next.js SEO Integration Contract (Phase 13)

Backend provides metadata for SSR. **Do not load SEO in `useEffect`.** Use `generateMetadata` / server components only.

## Resolve API

`GET /api/v1/seo/resolve?path=/courses/example-course`

Success (`200`):

```json
{
  "success": true,
  "data": {
    "type": "course|page|redirect",
    "path": "/courses/example-course",
    "found": true,
    "redirect": null,
    "title": "...",
    "description": "...",
    "canonicalUrl": "https://site/courses/example-course",
    "robots": "index, follow",
    "robotsIndex": true,
    "robotsFollow": true,
    "openGraph": { "title": "", "description": "", "image": "", "url": "", "type": "website", "siteName": "" },
    "twitter": { "card": "summary_large_image", "title": "", "description": "", "image": "" },
    "jsonLd": [],
    "jsonLdScript": "[...]",
    "site": { "name": "SkillBee", "url": "https://site" }
  }
}
```

Redirect payload: `type: "redirect"`, `redirect: { status: 301|302, location: "https://..." }`.

Unknown / draft course: `404` with `SEO_NOT_FOUND`.

## Example `generateMetadata`

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const path = `/courses/${params.slug}`;
  try {
    const ctrl = AbortSignal.timeout(1500);
    const res = await fetch(`${process.env.SEO_API_BASE}/api/v1/seo/resolve?path=${encodeURIComponent(path)}`, {
      next: { revalidate: 60, tags: [`seo:${path}`] },
      signal: ctrl,
    });
    if (!res.ok) return { title: 'SkillBee' };
    const json = await res.json();
    const m = json.data;
    if (m.redirect) return {}; // middleware handles redirect
    return {
      title: m.title,
      description: m.description,
      alternates: { canonical: m.canonicalUrl },
      robots: { index: m.robotsIndex, follow: m.robotsFollow },
      openGraph: {
        title: m.openGraph.title,
        description: m.openGraph.description,
        images: m.openGraph.image ? [m.openGraph.image] : [],
        url: m.openGraph.url,
        siteName: m.openGraph.siteName,
      },
      twitter: {
        card: m.twitter.card,
        title: m.twitter.title,
        description: m.twitter.description,
        images: m.twitter.image ? [m.twitter.image] : [],
      },
    };
  } catch {
    return { title: 'SkillBee' }; // never block render
  }
}
```

## JSON-LD in layout/page (server)

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: meta.jsonLdScript }}
/>
```

## Middleware redirects

Call `GET /api/v1/seo/resolve?path=...` or `GET /api/v1/seo/http-redirect?path=...`.

Prefer resolve JSON in Edge middleware, then `NextResponse.redirect(location, status)`.

Alternatively proxy old URLs to backend `http-redirect` which returns real `301`/`302`.

## Crawl files

Proxy website origin:

- `https://site/robots.txt` → backend `GET /robots.txt`
- `https://site/sitemap.xml` → backend `GET /sitemap.xml`
- `https://site/sitemap-index.xml` → backend `GET /sitemap-index.xml`

## Caching rules

- Cache keys must include the full path.
- Revalidate/invalidate when admin updates SEO, publishes courses, or changes slugs.
- Never reuse one path’s metadata for another.
