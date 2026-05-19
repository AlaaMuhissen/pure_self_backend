import { supabase } from "../db/supabase";

const TABLE = "specialist_patients";

export async function getPatientsForSpecialist(specialistId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*, patient_profiles(*)")
    .eq("specialist_id", specialistId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getSpecialistsForPatient(patientId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*, specialists(*)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function addPatientToSpecialist(specialistId: string, patientId: string) {
  const { data, error } = await supabase
    .from(TABLE).upsert({ specialist_id: specialistId, patient_id: patientId }, { onConflict: "specialist_id,patient_id" })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removePatientFromSpecialist(specialistId: string, patientId: string) {
  const { error } = await supabase
    .from(TABLE).delete().eq("specialist_id", specialistId).eq("patient_id", patientId);
  if (error) throw new Error(error.message);
}