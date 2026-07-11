# Pages — component dependency trees

Every page implicitly depends on the global shell from `app/layout.tsx`:
```
app/layout.tsx
- app/globals.css
- components/IntroLoader.tsx
- components/SmoothScroll.tsx
- components/MagneticCursor.tsx
- components/Header.tsx
- components/PageTransition.tsx
- components/Footer.tsx
  - lib/data.ts (shops)
- lib/utils.ts (cn)
```
The trees below list page-specific dependencies only. When passing `--context-file`, include the page tree + Header + Footer + globals.css (or theme.md token summary) + design-system.md.

## / (Home)
Entry: `app/page.tsx`
```
app/page.tsx
- components/ScrollIntroSequence.tsx   (400vh pinned cinematic 3D intro; uses /images/*.jpg)
- components/Hero.tsx
  - components/Photo.tsx
    - components/ImagePlaceholder.tsx
  - components/Hero3D.tsx
    - components/Medallion3D.tsx
  - components/ui/button.tsx
- components/SectionHeading.tsx
- components/ShopCard.tsx
  - components/Photo.tsx
- components/ProductCard.tsx
  - components/ImagePlaceholder.tsx
- components/BlogCard.tsx
  - components/Photo.tsx
- components/ImagePlaceholder.tsx
- components/Reveal.tsx
- lib/data.ts (shops, featuredProducts, blogPosts)
```

## /negozi (Shop listing)
Entry: `app/negozi/page.tsx`
```
app/negozi/page.tsx
- components/SectionHeading.tsx
- components/ShopCard.tsx
  - components/Photo.tsx
    - components/ImagePlaceholder.tsx
- components/Reveal.tsx
- lib/data.ts (shops)
```

## /negozi/[slug] (Shop detail — `centro`, `carni`)
Entry: `app/negozi/[slug]/page.tsx`
```
app/negozi/[slug]/page.tsx
- components/Hero.tsx  (with backLink + showMedallion)
  - components/Photo.tsx → components/ImagePlaceholder.tsx
  - components/Hero3D.tsx → components/Medallion3D.tsx
  - components/ui/button.tsx
- components/SectionHeading.tsx
- components/ProductCard.tsx
  - components/ImagePlaceholder.tsx
- components/Reveal.tsx
- lib/data.ts (shops, featuredProducts)
```

## /porchetta (Porchetta storytelling)
Entry: `app/porchetta/page.tsx`
```
app/porchetta/page.tsx
- components/Hero.tsx (showMedallion, primaryCta)
  - components/Photo.tsx → components/ImagePlaceholder.tsx
  - components/Hero3D.tsx → components/Medallion3D.tsx
  - components/ui/button.tsx
- components/ImagePlaceholder.tsx
- components/SectionHeading.tsx
- components/Reveal.tsx
(local const: 3 `steps` process cards)
```

## /blog (News listing)
Entry: `app/blog/page.tsx`
```
app/blog/page.tsx
- components/SectionHeading.tsx
- components/BlogCard.tsx
  - components/Photo.tsx → components/ImagePlaceholder.tsx
- components/Reveal.tsx
- lib/data.ts (blogPosts)
```

## /blog/[slug] (Article)
Entry: `app/blog/[slug]/page.tsx`
```
app/blog/[slug]/page.tsx
- components/Photo.tsx → components/ImagePlaceholder.tsx
- lib/data.ts (blogPosts)
```

## /prenotazioni (Reservation)
Entry: `app/prenotazioni/page.tsx`
```
app/prenotazioni/page.tsx
- components/SectionHeading.tsx
- components/ReservationForm.tsx
  - lib/data.ts (shops)
  - POST /api/prenotazioni (app/api/prenotazioni/route.ts, stub)
- components/Reveal.tsx
```

## /account (Area personale)
Entry: `app/account/page.tsx`
```
app/account/page.tsx
- components/SectionHeading.tsx
- components/AccountArea.tsx
  - components/LoyaltyCard.tsx
- components/Reveal.tsx
```
