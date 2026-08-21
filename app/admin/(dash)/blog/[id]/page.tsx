import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/forms";
import { adminGetBlogPost, adminGetCategories } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditBlogPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, categories] = await Promise.all([adminGetBlogPost(id), adminGetCategories("post")]);
  if (!post) notFound();

  return (
    <div>
      <Link href="/admin/blog" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950">
        <ArrowLeft className="size-4" /> News
      </Link>
      {/* The public route resolves by slug whatever the publication state, so
          this doubles as the preview for a draft or a scheduled post — the one
          thing you want before pressing "Pubblica" and there was no way to. */}
      <AdminHeader
        title={post.title}
        subtitle="Modifica articolo"
        action={
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            {post.published ? "Vedi sul sito ↗" : "Anteprima ↗"}
          </a>
        }
      />
      <Panel>
        <BlogForm post={post} categories={categories} />
      </Panel>
    </div>
  );
}
