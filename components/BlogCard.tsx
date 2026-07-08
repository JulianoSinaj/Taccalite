import Link from "next/link";
import Photo from "./Photo";
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
    <Link
      href={`/blog/${post.slug}`}
      className="group block overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50 transition-shadow hover:shadow-xl hover:shadow-brown-900/10"
    >
      <Photo
        src={post.image}
        alt={post.title}
        label={post.imageLabel}
        ratio="wide"
        className="rounded-none rounded-t-2xl border-0"
      />
      <div className="p-5">
        <div className="text-xs font-medium text-taupe">{formatDate(post.date)}</div>
        <h3 className="font-display mt-1 text-xl font-semibold text-brown-900 group-hover:text-gold-dark">
          {post.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{post.excerpt}</p>
      </div>
    </Link>
  );
}
