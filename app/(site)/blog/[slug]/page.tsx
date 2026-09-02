import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogCard from "@/components/BlogCard";
import ArticleBody from "@/components/site/blog/ArticleBody";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { articleSchema, breadcrumbSchema } from "@/lib/seo";
import { getBlogPostBySlug, getBlogPosts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};
  // The editor can set a search-result title and snippet separately from the
  // on-page title and the listing blurb; both fall back to those.
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const [post, allPosts] = await Promise.all([getBlogPostBySlug(slug), getBlogPosts()]);
  if (!post) notFound();

  const otherPosts = allPosts.filter((p) => p.slug !== slug);

  return (
    <div>
      <JsonLd
        schema={[
          articleSchema(post),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "News", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />

      {/* The article itself: one of four templates, chosen per post in the
          gestionale. See `lib/blog-article.ts` for the grammar the body is
          written in and what each template does with it. */}
      <ArticleBody post={post} />

      {/* Altre storie. A hairline as well as the warm ground: the photo-essay
          template ends on a warm band of its own, and without the rule the two
          would merge into one. */}
      {otherPosts.length > 0 && (
        <section className="border-t border-rule bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-[88rem]">
            <Reveal className="mb-14 border-b border-rule pb-10">
              <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
                <span aria-hidden className="h-px w-10 bg-gold" />
                Continua a leggere
              </p>
              <h2 className="font-display display-lg mt-7 font-semibold text-brown-950">
                Altre storie <span className="wonk text-gold-deep">dalla bottega</span>
              </h2>
            </Reveal>
            <RevealStagger className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
              {otherPosts.map((p) => (
                <RevealStaggerItem key={p.slug}>
                  <BlogCard post={p} />
                </RevealStaggerItem>
              ))}
            </RevealStagger>
          </div>
        </section>
      )}
    </div>
  );
}
