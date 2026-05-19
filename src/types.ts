import { Request } from "express";

// ===== API RESPONSE =====

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  count?: number;
};

export interface AuthData {
  userId: string;
  sessionId?: string;
  orgId?: string;
  orgRole?: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthData;
}


// ===== USER =====

export type UserRole = "user" | "specialist" | "admin";

export interface User {
  id: string;
  clerk_user_id: string;
  email?: string;
  name?: string;
  profile_image?: string | null;
  role?: UserRole;
  subscription_active?: boolean;
  created_at: string;
}

// ===== SPECIALIST =====

export interface Specialist {
  user_id: string;
  bio?: string;
  hourly_price?: number;
  available?: boolean;
  tags?: string[];
}

// ===== BOOKING =====

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export type PaymentStatus =
  | "unpaid"
  | "paid"
  | "failed";

export interface Booking {
  id: string;
  user_id: string;
  specialist_id: string;

  starts_at: string;
  ends_at: string;

  status: BookingStatus;
  payment_status: PaymentStatus;

  payment_id?: string;
  price?: number;

  google_meet_url?: string;
  google_event_id?: string;
  calendar_provider?: string;
  meeting_status?: string;

  created_at: string;
}

// ===== PAYMENT =====

export interface Payment {
  id: string;
  user_id: string;
  booking_id: string;

  amount: number;
  currency: string;
  status: string;

  provider?: string;
  provider_transaction_id?: string;
  provider_response?: any;

  created_at: string;
}

// ===== SCHEDULE BLOCK =====

export interface ScheduleBlock {
  id: string;
  specialist_id: string;

  starts_at: string;
  ends_at: string;

  block_type?: string;
  note?: string;

  created_at: string;
}