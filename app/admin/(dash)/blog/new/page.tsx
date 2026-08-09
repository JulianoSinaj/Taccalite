import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/forms";

export const dynamic = "force-dynamic";

export default function NewBlogPost() {
  return (
    <div>
      <BackLink href="/admin/blog">News</BackLink>
      <AdminHeader title="Nuovo articolo" subtitle="Scrivi una news per il sito" />
      <Panel>
        <BlogForm />
      </Panel>
    </div>
  );
}
