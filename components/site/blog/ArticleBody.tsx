import {
  articleBlocks,
  formatBlogDate,
  readingMinutes,
  resolveLayout,
} from "@/lib/blog-article";
import { categoryAccent } from "@/lib/categories";
import type { BlogPostRow } from "@/lib/db/schema";
import Editoriale from "./Editoriale";
import Rivista from "./Rivista";
import Avviso from "./Avviso";
import Galleria from "./Galleria";
import type { TemplateProps } from "./shared";

const TEMPLATES: Record<string, (props: TemplateProps) => React.ReactElement> = {
  editoriale: Editoriale,
  rivista: Rivista,
  avviso: Avviso,
  galleria: Galleria,
};

/**
 * One post, rendered by whichever of the four templates it is filed under.
 *
 * The parsing, the date and the reading time happen once here rather than in
 * each template — partly so the four cannot drift, and partly because a
 * template must never call `new Date()` in a render body (the React Compiler
 * lint rejects it, and correctly: the value would differ between the server
 * pass and the client one).
 *
 * `--acc` is set here too, on the article's own root. Everything below reads
 * `var(--acc)` and none of it knows which colour it is — the rule the whole
 * storefront palette runs on.
 */
export default function ArticleBody({ post }: { post: BlogPostRow }) {
  const Template = TEMPLATES[resolveLayout(post.layout)] ?? Editoriale;
  const blocks = articleBlocks(post.content);

  return (
    <div style={{ "--acc": categoryAccent(post.category) } as React.CSSProperties}>
      <Template
        post={post}
        blocks={blocks}
        date={formatBlogDate(post.date)}
        minutes={readingMinutes(post.content)}
      />
    </div>
  );
}
