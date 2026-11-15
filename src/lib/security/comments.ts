import type { CommentThread } from "@/lib/security/pdf-security";

/** Keeps reply metadata inside a PDF text note without inventing a non-standard annotation. */
export const COMMENT_REPLY_MARKER = "\n\n<anydoc-reply>";

export function encodeCommentContents(comment: CommentThread): string {
  const replies = comment.replies
    .map((reply) => COMMENT_REPLY_MARKER + JSON.stringify(reply))
    .join("");
  return `${comment.text}${replies}`;
}

export function splitCommentReplies(contents: string): {
  text: string;
  replies: CommentThread["replies"];
} {
  const markerIndex = contents.indexOf(COMMENT_REPLY_MARKER);
  if (markerIndex < 0) return { text: contents, replies: [] };

  const text = contents.slice(0, markerIndex);
  const rest = contents.slice(markerIndex + COMMENT_REPLY_MARKER.length);
  const replies: CommentThread["replies"] = [];

  for (const chunk of rest.split(COMMENT_REPLY_MARKER)) {
    if (!chunk.trim()) continue;
    try {
      const parsed = JSON.parse(chunk) as { author?: unknown; text?: unknown; date?: unknown };
      if (typeof parsed.author === "string" && typeof parsed.text === "string") {
        replies.push({
          author: parsed.author,
          text: parsed.text,
          date: typeof parsed.date === "string" ? parsed.date : "",
        });
      }
    } catch {
      // Foreign text may contain the marker literally; treat it as comment text.
    }
  }

  return { text, replies };
}