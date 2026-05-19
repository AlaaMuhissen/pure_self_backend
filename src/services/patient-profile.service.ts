import { supabase } from "../db/supabase";
// import { UpsertPatientProfileInput } from "../schemas/patient-profile.schema";

const TABLE = "patient_profiles";

export async function getAllPatientProfiles(specialistId?: string) {
  let q = supabase.from(TABLE).select("*").order("created_at", { ascending: false });
  if (specialistId) q = q.eq("specialist_id", specialistId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function getPatientProfileByUserId(userId: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).single();
  if (error) throw new Error(error.message);
  return data;
}

// export async function upsertPatientProfile(userId: string, payload: UpsertPatientProfileInput) {
//   const { data, error } = await supabase
//     .from(TABLE).upsert({ user_id: userId, ...payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
//     .select().single();
//   if (error) throw new Error(error.message);
//   return data;
// }

export async function deletePatientProfile(userId: string) {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}