import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import dotenv from "dotenv";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Service Role Key:", supabaseServiceRoleKey ? "Present" : "Missing");
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("Supabase client initialized successfully." , supabase);


dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

