import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import type { ApiResponse } from "../types";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    const body: ApiResponse = {
      success: false,
      error: "Validation error",
      message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    };
    res.status(400).json(body);
    return;
  }

  // Known operational errors → 400
  if (err instanceof Error && err.message.startsWith("Forbidden")) {
    res.status(403).json({ success: false, error: err.message } satisfies ApiResponse);
    return;
  }

  if (err instanceof Error && err.message.startsWith("User not found")) {
    res.status(404).json({ success: false, error: err.message } satisfies ApiResponse);
    return;
  }

  // Unexpected errors → 500
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[ErrorHandler]", err);

  const body: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : message,
  };
  res.status(500).json(body);
}
