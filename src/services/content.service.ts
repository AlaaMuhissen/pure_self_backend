import { supabaseAdmin } from "../config/supabase";

export type ContentRow = {
  id: string;
  type: "video" | "book" | "article" | "session";
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  duration: string | null;
  author: string | null;
  is_published: boolean;
  created_at: string;
};

/**
 * Returns ONE content item by uuid.
 * This is the PUBLIC version (does NOT return content_body).
 */
export async function getContentById(id: string): Promise<ContentRow> {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select(PUBLIC_FIELDS)
    .eq("id", id)
    .single();

  if (error) {
    // PostgREST codes:
    // PGRST116 = row not found when using .single()
    // We'll just throw a friendly error for route layer
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Content not found");
  }

  return data as ContentRow;
}

export async function listPublishedContent() {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getContentFullById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select("id,is_free,content_body,is_published")
    .eq("id", id)
    .single();

  if (error || !data) throw new Error("Not found");
  return data;
}

const PUBLIC_FIELDS =
  "id,type,title,description,price,currency,image_url,duration,author,is_free,preview_body,is_published,created_at";

export async function getContentByIdPublic(id: string) {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .select(PUBLIC_FIELDS)
    .eq("id", id)
    .single();

  if (error || !data) throw new Error("Not found");
  return data;
}

export async function createContent(item: any) {
  const { data, error } = await supabaseAdmin
    .from("content_items")
    .insert(item)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}



// import { supabase } from "../db/supabase";
// // import {
// //   CreateContentItemInput, UpdateContentItemInput, ContentQuery,
// //   UpsertArticleDetails, UpsertBookDetails, UpsertVideoDetails, UpsertSessionDetails,
// // } from "../schemas/content.schema";

// const TABLE = "content_items";

// export async function getContentItems(query: ContentQuery) {
//   let q = supabase.from(TABLE).select("*", { count: "exact" });
//   if (query.type) q = q.eq("type", query.type);
//   if (query.is_free !== undefined) q = q.eq("is_free", query.is_free);
//   if (query.is_published !== undefined) q = q.eq("is_published", query.is_published);
//   q = q.order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
//   const { data, error, count } = await q;
//   if (error) throw new Error(error.message);
//   return { data, count };
// }

// export async function getContentItemById(id: string) {
//   const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function getContentItemWithDetails(id: string) {
//   const { data: item, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
//   if (error) throw new Error(error.message);

//   let details = null;
//   if (item.type === "article") {
//     const { data } = await supabase.from("content_article_details").select("*").eq("content_id", id).single();
//     details = data;
//   } else if (item.type === "book") {
//     const { data } = await supabase.from("content_book_details").select("*").eq("content_id", id).single();
//     details = data;
//   } else if (item.type === "video") {
//     const { data } = await supabase.from("content_video_details").select("*").eq("content_id", id).single();
//     details = data;
//   } else if (item.type === "session") {
//     const { data } = await supabase.from("content_session_details").select("*").eq("content_id", id).single();
//     details = data;
//   }
//   return { ...item, details };
// }

// export async function createContentItem(payload: CreateContentItemInput) {
//   const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function updateContentItem(id: string, payload: UpdateContentItemInput) {
//   const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function deleteContentItem(id: string) {
//   const { error } = await supabase.from(TABLE).delete().eq("id", id);
//   if (error) throw new Error(error.message);
// }

// // ── Details ───────────────────────────────────────────────────────────────────

// export async function upsertArticleDetails(contentId: string, payload: UpsertArticleDetails) {
//   const { data, error } = await supabase
//     .from("content_article_details").upsert({ content_id: contentId, ...payload }, { onConflict: "content_id" }).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function upsertBookDetails(contentId: string, payload: UpsertBookDetails) {
//   const { data, error } = await supabase
//     .from("content_book_details").upsert({ content_id: contentId, ...payload }, { onConflict: "content_id" }).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function upsertVideoDetails(contentId: string, payload: UpsertVideoDetails) {
//   const { data, error } = await supabase
//     .from("content_video_details").upsert({ content_id: contentId, ...payload }, { onConflict: "content_id" }).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

// export async function upsertSessionDetails(contentId: string, payload: UpsertSessionDetails) {
//   const { data, error } = await supabase
//     .from("content_session_details").upsert({ content_id: contentId, ...payload }, { onConflict: "content_id" }).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }