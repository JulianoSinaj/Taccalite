import { NextResponse } from "next/server";
import { readMedia } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve an admin-uploaded image from the persisted uploads directory. Filenames
 * are validated (generated form only) so this can't be used for path traversal.
 * Files are content-addressed by a unique name, so they're immutable/cacheable.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const media = await readMedia(file);
  if (!media) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(media.body), {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
