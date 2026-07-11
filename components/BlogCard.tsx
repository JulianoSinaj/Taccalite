import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ImagePlaceholder from "./ImagePlaceholder";
import type { BlogPost } from "@/lib/data";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="group card-shadow-soft overflow-hidden rounded-[28px] border border-brown-900/10 bg-white/50 transition-all duration-500 hover:-translate-y-2 hover:border-brown-900/20">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden">
          {post.image ? (
            <>
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brown-950/60 via-transparent to-transparent" />
            </>
          ) : (
            <ImagePlaceholder label={post.imageLabel} ratio="wide" className="h-full rounded-none border-0" />
          )}
        </div>
        <div className="space-y-4 p-7 lg:p-10">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold tracking-wider text-taupe uppercase">
              {formatDate(post.date)}
            </span>
            <span className="rounded-full bg-gold/10 px-3 py-1 text-[9px] font-bold tracking-widest text-gold-dark uppercase">
              {post.category}
            </span>
          </div>
          <h2 className="font-display text-2xl leading-tight font-semibold text-brown-950 transition-colors group-hover:text-gold-dark">
            {post.title}
          </h2>
          <p className="text-sm leading-relaxed text-brown-900/60">{post.excerpt}</p>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-gold-dark transition-all group-hover:gap-4">
            Leggi di più
            <ArrowRight className="size-4" />
          </span>
        </div>
      </Link>
    </article>
  );
}
