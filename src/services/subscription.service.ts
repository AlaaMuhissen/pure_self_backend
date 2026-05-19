import { supabase } from "../db/supabase";
import { CreateSubscriptionInput, UpdateSubscriptionInput, SubscriptionQuery } from "../schemas/subscription.schema";

const TABLE = "subscriptions";

export async function getSubscriptions(query: SubscriptionQuery) {
  let q = supabase.from(TABLE).select("*", { count: "exact" });
  if (query.user_id) q = q.eq("user_id", query.user_id);
  if (query.plan) q = q.eq("plan", query.plan);
  if (query.status) q = q.eq("status", query.status);
  q = q.order("current_period_start", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data, count };
}

export async function getSubscriptionById(id: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActiveSubscriptionByUser(userId: string) {
  const { data, error } = await supabase
    .from(TABLE).select("*").eq("user_id", userId).eq("status", "active").order("current_period_end", { ascending: false }).limit(1).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createSubscription(payload: CreateSubscriptionInput) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSubscription(id: string, payload: UpdateSubscriptionInput) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelSubscription(id: string) {
  const { data, error } = await supabase
    .from(TABLE).update({ status: "cancelled" }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSubscription(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
}