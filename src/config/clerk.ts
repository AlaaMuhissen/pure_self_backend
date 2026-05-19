import { createClerkClient } from "@clerk/backend";

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error("Missing CLERK_SECRET_KEY");
}

export const clerk = createClerkClient({
  secretKey,
});