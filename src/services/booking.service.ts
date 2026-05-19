import { supabase } from "../db/supabase";
import {
  CreateBookingInput,
  UpdateBookingInput,
  BookingQuery,
} from "../schemas/booking.schema";

const TABLE = "bookings";

const ALLOWED_BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "completed"] as const;
const ALLOWED_PAYMENT_STATUSES = ["unpaid", "paid", "failed"] as const;

export async function getBookings(query: BookingQuery) {
  let q = supabase.from(TABLE).select("*", { count: "exact" });

  if (query.user_id) q = q.eq("user_id", query.user_id);
  if (query.specialist_id) q = q.eq("specialist_id", query.specialist_id);
  if (query.status) q = q.eq("status", query.status);
  if (query.payment_status) q = q.eq("payment_status", query.payment_status);
  if (query.from) q = q.gte("starts_at", query.from);
  if (query.to) q = q.lte("ends_at", query.to);

  q = q
    .order("starts_at", { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

  return { data: data ?? [], count: count ?? 0 };
}

export async function getBookingById(id: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Failed to fetch booking: ${error.message}`);
  return data;
}

export async function getBookingsByUser(userId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("starts_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch user bookings: ${error.message}`);
  return data ?? [];
}

export async function getBookingsBySpecialist(specialistId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("specialist_id", specialistId)
    .order("starts_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch specialist bookings: ${error.message}`);
  return data ?? [];
}


export async function createBooking(payload: CreateBookingInput) {
  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Failed to create booking: ${error.message}`);
  return data;
}

export async function updateBooking(id: string, payload: UpdateBookingInput) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update booking: ${error.message}`);
  return data;
}

export async function updateBookingStatus(
  id: string,
  status: (typeof ALLOWED_BOOKING_STATUSES)[number]
) {
  if (!ALLOWED_BOOKING_STATUSES.includes(status)) {
    throw new Error(`Invalid booking status: ${status}`);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update booking status: ${error.message}`);
  return data;
}

export async function updatePaymentStatus(
  id: string,
  payment_status: (typeof ALLOWED_PAYMENT_STATUSES)[number],
  payment_id?: string
) {
  if (!ALLOWED_PAYMENT_STATUSES.includes(payment_status)) {
    throw new Error(`Invalid payment status: ${payment_status}`);
  }

  const patch: Record<string, unknown> = { payment_status };
  if (payment_id) patch.payment_id = payment_id;

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update payment status: ${error.message}`);
  return data;
}

export async function cancelBooking(id: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: "cancelled" })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to cancel booking: ${error.message}`);
  return data;
}

export async function deleteBooking(id: string) {
  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}