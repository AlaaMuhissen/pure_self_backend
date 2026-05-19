import { google } from "googleapis";
import { createOAuthClient } from "./google.service";
import { pool } from "../db/supabase";
import crypto from "crypto";

type CreateMeetingInput = {
  bookingId: string;
};

export async function createMeetForBooking({ bookingId }: CreateMeetingInput) {
  // 1) load booking + specialist + patient
  const bookingRes = await pool.query(
    `
    select
      b.id,
      b.starts_at,
      b.ends_at,
      b.specialist_id,
      b.user_id as patient_user_id,
      b.google_event_id,
      p.email as patient_email,
      p.full_name as patient_name,
      sprof.full_name as specialist_name
    from bookings b
    join users u on u.id = b.user_id
    left join profiles p on p.user_id = u.id
    join specialists s on s.id = b.specialist_id
    join users su on su.id = s.user_id
    left join profiles sprof on sprof.user_id = su.id
    where b.id = $1
    limit 1
    `,
    [bookingId]
  );

  const booking = bookingRes.rows[0];
  if (!booking) throw new Error("Booking not found");

  // 2) load specialist google tokens
  const tokenRes = await pool.query(
    `
    select google_access_token, google_refresh_token, google_expiry_date
    from specialist_google_tokens
    where specialist_id = $1
    limit 1
    `,
    [booking.specialist_id]
  );

  const tokenRow = tokenRes.rows[0];
  if (!tokenRow) {
    throw new Error("Specialist did not connect Google Calendar");
  }

  // 3) auth client
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokenRow.google_access_token,
    refresh_token: tokenRow.google_refresh_token,
    expiry_date: tokenRow.google_expiry_date,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestId = crypto.randomUUID();

  const eventBody = {
    summary: `Consultation with ${booking.specialist_name ?? "Specialist"}`,
    description: `Booking ID: ${booking.id}`,
    start: {
      dateTime: new Date(booking.starts_at).toISOString(),
    },
    end: {
      dateTime: new Date(booking.ends_at).toISOString(),
    },
    attendees: booking.patient_email
      ? [
          {
            email: booking.patient_email,
            displayName: booking.patient_name ?? undefined,
          },
        ]
      : [],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: {
          type: "hangoutsMeet",
        },
      },
    },
  };

  // 4) create event + request Meet
  const insertRes = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: eventBody,
  });

  const createdEvent = insertRes.data;

  // 5) store event id + first meet link if already available
  await pool.query(
    `
    update bookings
    set
      google_event_id = $2,
      google_meet_url = $3,
      calendar_provider = 'google',
      meeting_status = $4
    where id = $1
    `,
    [
      booking.id,
      createdEvent.id ?? null,
      createdEvent.hangoutLink ?? null,
      createdEvent.hangoutLink ? "created" : "pending",
    ]
  );

  return {
    eventId: createdEvent.id ?? null,
    meetUrl: createdEvent.hangoutLink ?? null,
    raw: createdEvent,
  };
}

export async function refreshMeetForBooking(bookingId: string) {
  const bookingRes = await pool.query(
    `
    select b.id, b.google_event_id, b.specialist_id
    from bookings b
    where b.id = $1
    limit 1
    `,
    [bookingId]
  );

  const booking = bookingRes.rows[0];
  if (!booking?.google_event_id) {
    throw new Error("Booking has no Google event");
  }

  const tokenRes = await pool.query(
    `
    select google_access_token, google_refresh_token, google_expiry_date
    from specialist_google_tokens
    where specialist_id = $1
    limit 1
    `,
    [booking.specialist_id]
  );

  const tokenRow = tokenRes.rows[0];
  if (!tokenRow) {
    throw new Error("Specialist did not connect Google Calendar");
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: tokenRow.google_access_token,
    refresh_token: tokenRow.google_refresh_token,
    expiry_date: tokenRow.google_expiry_date,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const eventRes = await calendar.events.get({
    calendarId: "primary",
    eventId: booking.google_event_id,
  });

  const event = eventRes.data;

  await pool.query(
    `
    update bookings
    set
      google_meet_url = $2,
      meeting_status = $3
    where id = $1
    `,
    [
      bookingId,
      event.hangoutLink ?? null,
      event.hangoutLink ? "created" : "pending",
    ]
  );

  return {
    eventId: event.id ?? null,
    meetUrl: event.hangoutLink ?? null,
    raw: event,
  };
}