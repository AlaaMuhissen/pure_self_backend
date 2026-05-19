import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../types";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("[ErrorHandler]", err);
  const body: ApiResponse = {
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  };
  res.status(500).json(body);
}