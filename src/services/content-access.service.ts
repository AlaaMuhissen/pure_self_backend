import { supabase } from "../db/supabase";
// import { GrantContentAccessInput } from "../schemas/content-access.schema";

const TABLE = "content_access";

export async function getAccessByUser(userId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*, content_items(*)").eq("user_id", userId).order("granted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getAccessByContent(contentId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("content_id", contentId).order("granted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function checkUserAccess(userId: string, contentId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("user_id", userId).eq("content_id", contentId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// export async function grantAccess(payload: GrantContentAccessInput) {
//   const { data, error } = await supabase
//     .from(TABLE).upsert(payload, { onConflict: "user_id,content_id" }).select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

export async function revokeAccess(userId: string, contentId: string) {
  const { error } = await supabase
    .from(TABLE).delete().eq("user_id", userId).eq("content_id", contentId);
  if (error) throw new Error(error.message);
}