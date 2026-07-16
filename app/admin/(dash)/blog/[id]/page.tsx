import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/forms";
import { adminGetBlogPost } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditBlogPost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await adminGetBlogPost(id);
  if (!post) notFound();

  return (
    <div>
      <Link href="/admin/blog" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950">
        <ArrowLeft className="size-4" /> News
      </Link>
      <AdminHeader title={post.title} subtitle="Modifica articolo" />
      <Panel>
        <BlogForm post={post} />
      </Panel>
    </div>
  );
}
