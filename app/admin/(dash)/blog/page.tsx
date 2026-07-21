import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, fmtDate } from "@/components/admin/ui";
import { BlogForm } from "@/components/admin/forms";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetBlogPosts } from "@/lib/admin/queries";
import { deleteBlogPost, toggleBlogPublished } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminBlog() {
  const posts = await adminGetBlogPosts();

  return (
    <div>
      <AdminHeader title="News" subtitle={`${posts.length} articoli`} />

      <details className="mb-6">
        <summary className="cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase w-fit">
          + Nuovo articolo
        </summary>
        <Panel className="mt-4">
          <BlogForm />
        </Panel>
      </details>

      {posts.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun articolo ancora. Scrivine uno con il pulsante qui sopra.</p>
        </Panel>
      ) : (
      <div className="space-y-3">
        {posts.map((p) => (
          <Panel key={p.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="font-display text-lg text-brown-950">{p.title}</p>
                <p className="text-xs text-brown-800/60">
                  {p.category} · {fmtDate(p.date)}
                </p>
              </div>
              {!p.published && <StatusBadge status="pending" />}
            </div>
            <div className="flex items-center gap-2">
              <ActionForm action={toggleBlogPublished} className="inline-flex">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="published" value={p.published ? "false" : "true"} />
                <PendingButton tone="dark">{p.published ? "Nascondi" : "Pubblica"}</PendingButton>
              </ActionForm>
              <Link
                href={`/admin/blog/${p.id}`}
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Modifica
              </Link>
              <DeleteForm action={deleteBlogPost} id={p.id} confirm={`Eliminare "${p.title}"?`} />
            </div>
          </Panel>
        ))}
      </div>
      )}
    </div>
  );
}
