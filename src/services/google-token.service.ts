import { supabase } from "../db/supabase";
import { UpsertGoogleTokenInput } from "../schemas/google-token.schema";

const TABLE = "specialist_google_tokens";

export async function getTokenBySpecialist(specialistId: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("specialist_id", specialistId).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertGoogleToken(payload: UpsertGoogleTokenInput) {
  const patch = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from(TABLE).upsert(patch, { onConflict: "specialist_id" }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteGoogleToken(specialistId: string) {
  const { error } = await supabase.from(TABLE).delete().eq("specialist_id", specialistId);
  if (error) throw new Error(error.message);
}