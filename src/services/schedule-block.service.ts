import { supabase } from "../db/supabase";
import { CreateScheduleBlockInput, UpdateScheduleBlockInput, ScheduleBlockQuery } from "../schemas/schedule-block.schema";

const TABLE = "specialist_schedule_blocks";

export async function getScheduleBlocks(query: ScheduleBlockQuery) {
  let q = supabase.from(TABLE).select("*", { count: "exact" });
  if (query.specialist_id) q = q.eq("specialist_id", query.specialist_id);
  if (query.block_type) q = q.eq("block_type", query.block_type);
  if (query.from) q = q.gte("starts_at", query.from);
  if (query.to) q = q.lte("ends_at", query.to);
  q = q.order("starts_at", { ascending: true }).range(query.offset, query.offset + query.limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data, count };
}

export async function getScheduleBlockById(id: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getBlocksBySpecialist(specialistId: string, from?: string, to?: string) {
  let q = supabase.from(TABLE).select("*").eq("specialist_id", specialistId);
  if (from) q = q.gte("starts_at", from);
  if (to) q = q.lte("ends_at", to);
  q = q.order("starts_at", { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export async function createScheduleBlock(payload: CreateScheduleBlockInput) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateScheduleBlock(id: string, payload: UpdateScheduleBlockInput) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteScheduleBlock(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}