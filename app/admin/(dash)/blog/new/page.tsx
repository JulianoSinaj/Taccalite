import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/forms";
import { adminGetCategories } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function NewBlogPost() {
  const categories = await adminGetCategories("post");

  return (
    <div>
      <BackLink href="/admin/blog">News</BackLink>
      <AdminHeader title="Nuovo articolo" subtitle="Scrivi una news per il sito" />
      <Panel>
        <BlogForm categories={categories} />
      </Panel>
    </div>
  );
}
