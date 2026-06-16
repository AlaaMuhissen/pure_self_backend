import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { clerkMiddleware } from "@clerk/express";

import routes from "./routes";
import { errorHandler } from "./middleware/error.middleware";

const app = express();

// Security headers
app.use(helmet());

// CORS — restrict to known frontend origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : "*";

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// HTTP request logging (skip in test)
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// Body parsing
app.use(express.json());

// Auth
app.use(clerkMiddleware());

// Routes
app.use("/", routes);

// Global error handler — must be last
app.use(errorHandler);

export default app;
