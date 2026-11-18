/**
 * Website previews for `.bookmark` files — title, description, picture and
 * icon of a page. A browser page cannot read other sites' HTML (CORS), so the
 * page is read by Microlink's public API (https://microlink.io), which
 * answers with the page's Open Graph / meta data. Only the bookmarked URL is
 * sent, and only when a preview is asked for (adding a link, or "Fetch
 * previews"). The free tier allows about 50 lookups a day per address.
 */
import { type BookmarkPreview, httpUrl } from "@/lib/bookmark-doc";

const ENDPOINT = "https://api.microlink.io/";

type MicrolinkAnswer = {
  status?: string;
  message?: string;
  data?: {
    title?: unknown;
    description?: unknown;
    publisher?: unknown;
    image?: { url?: unknown } | null;
    logo?: { url?: unknown } | null;
  };
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Fetches the preview of `url`. Throws with a user-facing message. */
export async function fetchBookmarkPreview(
  url: string,
  signal?: AbortSignal,
): Promise<BookmarkPreview> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?url=${encodeURIComponent(url)}`, {
      signal,
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("The preview service could not be reached.");
  }
  const body = (await response
    .json()
    .catch(() => null)) as MicrolinkAnswer | null;
  if (response.status === 429) {
    throw new Error("Daily preview limit reached — try again tomorrow.");
  }
  if (!response.ok || body?.status !== "success" || !body.data) {
    throw new Error(
      text(body?.message) || `The preview service answered ${response.status}.`,
    );
  }
  const data = body.data;
  return {
    title: text(data.title),
    description: text(data.description),
    image: httpUrl(data.image?.url),
    logo: httpUrl(data.logo?.url),
    siteName: text(data.publisher),
    fetchedAt: new Date().toISOString(),
  };
}
