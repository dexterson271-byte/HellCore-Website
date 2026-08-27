import sanitizeHtml from "sanitize-html";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

export async function renderMarkdown(source: string) {
  const raw = await marked.parse(source || "");
  return sanitizeHtml(String(raw), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "span",
      "pre",
      "code",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title"],
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      span: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export function excerpt(text: string, n = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}
