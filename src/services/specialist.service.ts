import { supabase } from "../db/supabase";
import { UpsertSpecialistInput, SpecialistQuery } from "../schemas/specialist.schema";

const TABLE = "specialists";

export async function getSpecialists(query: SpecialistQuery) {
  let q = supabase.from(TABLE).select("*", { count: "exact" });
  if (query.available !== undefined) q = q.eq("available", query.available);
  if (query.tag) q = q.contains("tags", [query.tag]);
  q = q.range(query.offset, query.offset + query.limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data, count };
}

export async function getSpecialistByUserId(userId: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertSpecialist(userId: string, payload: UpsertSpecialistInput) {
  const { data, error } = await supabase
    .from(TABLE).upsert({ user_id: userId, ...payload }, { onConflict: "user_id" }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSpecialist(userId: string) {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function setAvailability(userId: string, available: boolean) {
  const { data, error } = await supabase
    .from(TABLE).update({ available }).eq("user_id", userId).select().single();
  if (error) throw new Error(error.message);
  return data;
}