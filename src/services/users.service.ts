import { pool, supabase, supabaseAdmin } from "../db/supabase";
import type { User } from "../types";


const TABLE = "users";

export type CreateUserInput = {
  clerk_user_id: string;
  email?: string;
  name?: string;
  role?: "user" | "specialist" | "admin";
  username?: string;
  profile_image?: string | null;
  palette_id?: string | null;
  subscription_active?: boolean;
};

export async function getUserById(id: string) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();

  if (error) throw new Error(`Failed to fetch user by id: ${error.message}`);
  return data;
}

export async function getUserByClerkId(clerkUserId: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch user by Clerk ID: ${error.message}`);
  return data;
}

export async function createUser(payload: CreateUserInput) {
  const insertPayload = {
    clerk_user_id: payload.clerk_user_id,
    email: payload.email ?? null,
    name: payload.name ?? null,
    role: payload.role ?? "user",
    username: payload.username ?? null,
    profile_image: payload.profile_image ?? null,
    palette_id: payload.palette_id ?? null,
    subscription_active: payload.subscription_active ?? false,
  };

  const { data, error } = await supabase.from(TABLE).insert(insertPayload).select().single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return data;
}

export async function updateUser(id: string, payload: Partial<CreateUserInput>) {
  const patch = {
    ...(payload.email !== undefined && { email: payload.email }),
    ...(payload.name !== undefined && { name: payload.name }),
    ...(payload.role !== undefined && { role: payload.role }),
    ...(payload.username !== undefined && { username: payload.username }),
    ...(payload.profile_image !== undefined && { profile_image: payload.profile_image }),
    ...(payload.palette_id !== undefined && { palette_id: payload.palette_id }),
    ...(payload.subscription_active !== undefined && {
      subscription_active: payload.subscription_active,
    }),
  };

  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).select().single();

  if (error) throw new Error(`Failed to update user: ${error.message}`);
  return data;
}

export async function findOrCreateUser(payload: CreateUserInput) {
  const existing = await getUserByClerkId(payload.clerk_user_id);
  if (existing) return existing;
  return createUser(payload);
}

export async function getDbUserIdFromClerkId(clerkUserId: string) {
  const user = await getUserByClerkId(clerkUserId);

  if (!user) {
    throw new Error("User not found in database for this Clerk account");
  }

  return user.id as string;
}

export async function requireDbUserByClerkId(clerkUserId: string) {
  const user = await getUserByClerkId(clerkUserId);

  if (!user) {
    throw new Error("User not found in database for this Clerk account");
  }

  return user;
}

export async function isUserRole(clerkUserId: string, role: "user" | "specialist" | "admin") {
  const user = await getUserByClerkId(clerkUserId);
  if (!user) return false;
  return user.role === role;
}

export async function listUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list users: ${error.message}`);
  return data ?? [];
}

export async function upsertUser(params: {
  clerk_user_id: string;
  email?: string | null;
  name?: string | null;
  profile_image?: string | null;
}): Promise<User> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .upsert(
      {
        clerk_user_id: params.clerk_user_id,
        email: params.email ?? null,
        name: params.name ?? null,
        profile_image: params.profile_image ?? null,
      },
      { onConflict: "clerk_user_id" },
    )
    .select("*")
    .single();

  if (error) throw error;

  return data as User;
}

export async function getUserAccessByClerkId(clerkUserId: string) {
  const { rows } = await pool.query(
    `
    SELECT role, subscription_active
    FROM users
    WHERE clerk_user_id = $1
    LIMIT 1
    `,
    [clerkUserId],
  );

  return rows[0] ?? null;
}
