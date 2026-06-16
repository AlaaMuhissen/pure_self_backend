import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) console.error("❌ Mail transporter error:", error);
  else console.log("✅ Mail transporter ready");
});

function generateICS({
  eventId,
  summary,
  description,
  startsAt,
  endsAt,
  organizerEmail,
  attendeeEmail,
  meetUrl,
}: {
  eventId:        string;
  summary:        string;
  description:    string;
  startsAt:       string;
  endsAt:         string;
  organizerEmail: string;
  attendeeEmail:  string | null;
  meetUrl:        string | null;
}) {
  const fmt = (dt: string) => new Date(dt).toISOString().replace(/[-:]/g, '').replace('.000', '');

  const attendeeLine = attendeeEmail
    ? `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`
    : '';

  const locationLine = meetUrl ? `LOCATION:${meetUrl}` : '';
  const descLine = meetUrl ? `${description}\\nرابط الجلسة: ${meetUrl}` : description;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PureSelf//AR',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${eventId}@pureself`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(startsAt)}`,
    `DTEND:${fmt(endsAt)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${descLine}`,
    locationLine,
    `ORGANIZER;CN=PureSelf:mailto:${organizerEmail}`,
    attendeeLine,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
function formatArabicDateTime(dt: string) {
  const date = new Date(dt);
  
  const datePart = date.toLocaleDateString('ar-SA', { 
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });

  const timePart = date.toLocaleTimeString('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return { datePart, timePart };
}
export async function sendBookingConfirmation({
  eventId,
  patientEmail,
  patientName,
  startsAt,
  endsAt,
  meetUrl,
  specialistName, 
}: {
  eventId:      string;
  patientEmail: string | null;
  patientName:  string;
  startsAt:     string;
  endsAt:       string;
  meetUrl:      string | null;
  specialistName?: string;
}) {
//   const start = new Date(startsAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
//   const end   = new Date(endsAt).toLocaleString('ar-SA',   { timeZone: 'Asia/Riyadh' });
  const { datePart: startDate, timePart: startTime } = formatArabicDateTime(startsAt);
  const { timePart: endTime } = formatArabicDateTime(endsAt);
  const meetLine = meetUrl ? `\nرابط الجلسة: ${meetUrl}` : '';

  // ── Email to patient ──
  if (patientEmail) {
    const ics = generateICS({
      eventId,
      summary:        `جلسة مع المختصة ${specialistName ? ` ${specialistName}` : ''}`,
      description:    `جلسة استشارة مع المختصة ${specialistName ? ` ${specialistName}` : ''}`,
      startsAt,
      endsAt,
      organizerEmail: process.env.MAIL_USER!,
      attendeeEmail:  patientEmail,
      meetUrl,
    });

   await transporter.sendMail({
        from:    `"PureSelf" <${process.env.MAIL_USER}>`,
        to:      patientEmail,
        subject: ` ${specialistName ? ` ${specialistName}` : ''} تأكيد جلستك مع المختصة`,
        html: `
            <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 15px; color: #2d1a0e; background: #fdf9f4; padding: 32px; border-radius: 12px; max-width: 480px; margin: auto;">
            <h2 style="color: #4a2c1a; margin-bottom: 8px;">${specialistName ? ` ${specialistName}` : ''} تأكيد جلستك مع المختصة</h2>
            <hr style="border: none; border-top: 1px solid rgba(74,44,26,0.15); margin-bottom: 20px;" />
            
            <p>مرحباً <strong>${patientName}</strong>،</p>
            <p>تم تأكيد جلستك بنجاح ✅</p>

            <div style="background: white; border: 1px solid rgba(74,44,26,0.12); border-radius: 10px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;">🗓 <strong>التاريخ:</strong> ${startDate}</p>
                <p style="margin: 0 0 8px 0;">🕐 <strong>الوقت:</strong> ${startTime} - ${endTime}</p>
                ${meetUrl ? `<p style="margin: 0;">🔗 <strong>رابط الجلسة:</strong> <a href="${meetUrl}" style="color: #7b4a2d;">${meetUrl}</a></p>` : ''}
            </div>

            <p style="color: #7b4a2d;">نتطلع لرؤيتك!</p>
            <p style="font-size: 12px; color: #a07060; margin-top: 24px;">PureSelf</p>
            </div>
        `,
        icalEvent: {
            method:  'REQUEST',
            content: ics,
        },
        });
  }

  // ── Email to specialist ──
  const icsSpecialist = generateICS({
    eventId,
    summary:        `جلسة مع ${patientName}`,
    description:    `جلسة استشارة مع ${patientName}`,
    startsAt,
    endsAt,
    organizerEmail: process.env.MAIL_USER!,
    attendeeEmail:  null,
    meetUrl,
  });

  await transporter.sendMail({
    from:    `"PureSelf" <${process.env.MAIL_USER}>`,
    to:      'Pureself11@gmail.com',
    subject: `جلسة مؤكدة مع ${patientName}`,
    text:    `تم تأكيد جلسة مع ${patientName}.\n\nالتاريخ : ${startDate}\nالوقت: ${startTime} - ${endTime}${meetLine}`,
    icalEvent: {
      method:  'REQUEST',
      content: icsSpecialist,
    },
  });
}