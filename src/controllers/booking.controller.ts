import { Request, Response, NextFunction } from "express";
import * as S from "../services/booking.service";
import { ApiResponse, AuthenticatedRequest } from "../types";
import {
  CreateBookingInput,
  UpdateBookingInput,
  BookingQuery,
  
} from "../schemas/booking.schema";
import { z } from "zod";
import { getDbUserIdFromClerkId } from "../services/users.service";

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

const SpecialistIdParamSchema = z.object({
  specialist_id: z.string().uuid(),
});

const PatchBookingStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed"]),
});

const PatchPaymentStatusSchema = z.object({
  payment_status: z.enum(["unpaid", "paid", "failed"]),
  payment_id: z.string().uuid().optional(),
});

export async function listBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const query = BookingQuery.parse(req.query);
    const result = await S.getBookings(query);
    res.json({ success: true, ...result } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function getBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const data = await S.getBookingById(id);

    if (!data) {
      res.status(404).json({ success: false, error: "Booking not found" } satisfies ApiResponse);
      return;
    }

    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function myBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;

    const dbUserId = await getDbUserIdFromClerkId(clerkUserId);
    const data = await S.getBookingsByUser(dbUserId);

    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function specialistBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const { specialist_id } = SpecialistIdParamSchema.parse(req.params);
    const data = await S.getBookingsBySpecialist(specialist_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

// export async function createBooking(req: Request, res: Response, next: NextFunction) {
//   try {
//     const { userId: clerkUserId } = (req as AuthenticatedRequest).auth;
//     const dbUserId = await getDbUserIdFromClerkId(clerkUserId);

//     const payload = CreateBookingInput.parse({
//       ...req.body,
//       user_id: dbUserId,
//     });

//     const data = await S.createBooking(payload);
//     res.status(201).json({ success: true, data } satisfies ApiResponse);
//   } catch (e) {
//     next(e);
//   }
// }

// export async function updateBooking(req: Request, res: Response, next: NextFunction) {
//   try {
//     const { id } = IdParamSchema.parse(req.params);
//     const payload = UpdateBookingInput.parse(req.body);
//     const data = await S.updateBooking(id, payload);
//     res.json({ success: true, data } satisfies ApiResponse);
//   } catch (e) {
//     next(e);
//   }
// }

export async function patchBookingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { status } = PatchBookingStatusSchema.parse(req.body);
    const data = await S.updateBookingStatus(id, status);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function patchPaymentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { payment_status, payment_id } = PatchPaymentStatusSchema.parse(req.body);
    const data = await S.updatePaymentStatus(id, payment_status, payment_id);
    res.json({ success: true, data } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}

export async function deleteBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = IdParamSchema.parse(req.params);
    await S.deleteBooking(id);
    res.json({ success: true, message: "Booking deleted." } satisfies ApiResponse);
  } catch (e) {
    next(e);
  }
}