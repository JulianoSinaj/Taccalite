/**
 * JSON-LD structured-data builders (schema.org). Rendered via <JsonLd>.
 * Improves local-search visibility for a discovery-dependent shop.
 */
import { siteConfig, absoluteUrl } from "./site";
import type { ShopRow, ProductRow, BlogPostRow } from "./db/schema";

type Json = Record<string, unknown>;

/** Map "071 663 5605" → "+3907166355605" style E.164-ish (best effort). */
function telHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.startsWith("0") ? `+39${digits}` : `+${digits}`;
}

export function organizationSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    email: siteConfig.email,
    foundingDate: String(siteConfig.founded),
    sameAs: [siteConfig.social.instagram, siteConfig.social.facebook],
  };
}

export function shopSchema(shop: ShopRow): Json {
  return {
    "@context": "https://schema.org",
    "@type": ["Store", "FoodEstablishment"],
    name: shop.name,
    description: shop.description,
    url: absoluteUrl(`/negozi/${shop.slug}`),
    telephone: telHref(shop.phone),
    email: shop.email,
    image: absoluteUrl(shop.image),
    priceRange: "€€",
    address: {
      "@type": "PostalAddress",
      streetAddress: shop.address,
      addressLocality: siteConfig.address.locality,
      addressRegion: siteConfig.address.region,
      addressCountry: siteConfig.address.country,
    },
    parentOrganization: { "@type": "Organization", name: siteConfig.name },
  };
}

export function productSchema(product: ProductRow): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category,
    image: absoluteUrl(product.image),
    brand: { "@type": "Brand", name: siteConfig.name },
  };
}

export function articleSchema(post: BlogPostRow): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    articleSection: post.category,
    image: post.image ? absoluteUrl(post.image) : undefined,
    author: { "@type": "Organization", name: siteConfig.name },
    publisher: { "@type": "Organization", name: siteConfig.name },
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
