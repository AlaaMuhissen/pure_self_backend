
import { google } from 'googleapis';


interface CreateEventParams {
  patientEmail: string;
  patientName:  string;
  startsAt:     string;
  endsAt:       string;
  bookingId:    string;
}

interface CreateEventResult {
  googleEventId:    string;
  googleMeetUrl:    string | null;
  calendarProvider: string;
}

export async function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  });
  return google.calendar({ version: 'v3', auth });
}

export async function createCalendarEvent({ patientEmail, patientName, startsAt, endsAt , bookingId}: CreateEventParams): Promise<CreateEventResult> {
  const calendar = await getCalendarClient();
  const meetUrl = `https://meet.jit.si/pureself-${bookingId}`;
  const event = await calendar.events.insert({
    calendarId: 'Pureself11@gmail.com',
    sendUpdates: 'none',
    requestBody: {
      summary: `جلسة مع ${patientName}`,
      description: `جلسة استشارة مع المختصة`,
      start: { dateTime: startsAt, timeZone: 'Asia/Riyadh' },
      end:   { dateTime: endsAt,   timeZone: 'Asia/Riyadh' },
    },
  });

  return {
    googleEventId:    event.data.id ?? "",
    googleMeetUrl:    meetUrl,
    calendarProvider: 'google',
  };
  }

export async function deleteCalendarEvent(googleEventId: string) {
  if (!googleEventId) return;
  const calendar = await getCalendarClient();
  await calendar.events.delete({
    calendarId: 'Pureself11@gmail.com',
    eventId: googleEventId,
    sendUpdates: 'none', 
  }).catch(err => console.error('Failed to delete calendar event:', err));
}

module.exports = { createCalendarEvent, deleteCalendarEvent };