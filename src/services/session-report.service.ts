import { supabase } from "../db/supabase";
import { CreateSessionReportInput, UpdateSessionReportInput, SessionReportQuery } from "../schemas/session-report.schema";

const TABLE = "session_reports";

export async function getSessionReports(query: SessionReportQuery) {
  let q = supabase.from(TABLE).select("*", { count: "exact" });
  if (query.specialist_id) q = q.eq("specialist_id", query.specialist_id);
  if (query.patient_id) q = q.eq("patient_id", query.patient_id);
  if (query.booking_id) q = q.eq("booking_id", query.booking_id);
  if (query.from) q = q.gte("report_date", query.from);
  if (query.to) q = q.lte("report_date", query.to);
  q = q.order("report_date", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data, count };
}

export async function getSessionReportById(id: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getReportsByPatient(patientId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("patient_id", patientId).order("report_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function getReportsBySpecialist(specialistId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("specialist_id", specialistId).order("report_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function createSessionReport(payload: CreateSessionReportInput) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSessionReport(id: string, payload: UpdateSessionReportInput) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSessionReport(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}