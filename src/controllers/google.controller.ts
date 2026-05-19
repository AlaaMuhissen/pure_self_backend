import { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { createOAuthClient, GOOGLE_SCOPES } from "../services/google.service";
import { pool } from "../db/supabase";


export async function startGoogleConnect(req: Request, res: Response) {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const oauth2Client = createOAuthClient();

  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });

  return res.json({ ok: true, url });
}

export async function googleOAuthCallback(req: Request, res: Response) {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    const parsedState = JSON.parse(Buffer.from(state, "base64").toString());
    const clerkUserId = parsedState.userId as string;

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const specialistRes = await pool.query(
      `
      select s.id
      from specialists s
      join users u on u.id = s.user_id
      where u.clerk_user_id = $1
      limit 1
      `,
      [clerkUserId]
    );

    const specialist = specialistRes.rows[0];
    if (!specialist) {
      return res.status(404).send("Specialist not found");
    }

    await pool.query(
      `
      insert into specialist_google_tokens
        (specialist_id, google_access_token, google_refresh_token, google_expiry_date, updated_at)
      values ($1, $2, $3, $4, now())
      on conflict (specialist_id)
      do update set
        google_access_token = excluded.google_access_token,
        google_refresh_token = coalesce(excluded.google_refresh_token, specialist_google_tokens.google_refresh_token),
        google_expiry_date = excluded.google_expiry_date,
        updated_at = now()
      `,
      [
        specialist.id,
        tokens.access_token ?? "",
        tokens.refresh_token ?? null,
        tokens.expiry_date ?? null,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";
    return res.redirect(`${frontendUrl}/specialist/settings?google=connected`);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Google connect failed");
  }
}