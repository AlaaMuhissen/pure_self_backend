<div align="center">

<img src="https://raw.githubusercontent.com/AlaaMuhissen/pure_self/main/public/ana_logo_2.jpeg" alt="ANA Logo" width="180" />

# أنا — ANA · Backend API

**The server powering a modern Arabic mental wellness platform**

[![Status](https://img.shields.io/badge/status-live-brightgreen?style=flat-square)](https://pure-self.vercel.app/)
[![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express)](https://expressjs.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?style=flat-square)](https://clerk.com)

🌐 **[Live App](https://pure-self.vercel.app/)** &nbsp;·&nbsp; 💻 **[Frontend Repo](https://github.com/AlaaMuhissen/pure_self)**

</div>

---

## 🗺 Overview

This is the REST API for **ANA** — a platform that connects Arabic-speaking women with certified mental health specialists and a curated self-development content library.

The API handles authentication, booking management, content access control, session reports, specialist scheduling, and admin operations — all backed by PostgreSQL via Supabase and authenticated through Clerk.

---

## 🏗 Architecture

The codebase follows a strict **three-layer architecture** across every domain:

```
routes/       → wiring only (middleware + handler registration, no logic)
controllers/  → request/response handling (validation, auth, HTTP shape)
services/     → data access only (all SQL lives here, no HTTP logic)
schemas/      → Zod validation schemas shared across layers
lib/          → shared utilities (Supabase storage, multer, helpers)
```

This means:
- **Routes** never touch the database
- **Controllers** never write raw SQL
- **Services** never know about `req` or `res`

---

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| Node.js 18 + TypeScript | Runtime + type safety |
| Express 4 | HTTP server and routing |
| PostgreSQL (via Supabase) | Primary database (`pg` pool for raw SQL) |
| Supabase Storage | File storage (PDFs, cover images) |
| Clerk | Authentication and JWT verification |
| Zod | Runtime request validation |
| Multer | Multipart file upload handling |
| Google Calendar API | Calendar event creation on booking confirmation |
| Nodemailer | Booking confirmation emails |

---

## 📁 Project Structure

```
src/
├── routes/
│   ├── index.routes.ts           # Main router — mounts all domains
│   ├── content.routes.ts
│   ├── bookings.routes.ts
│   ├── me.routes.ts
│   ├── patient.routes.ts
│   ├── progress.routes.ts
│   ├── specialists.routes.ts
│   ├── specialistProfile.routes.ts
│   ├── specialistSchedule.routes.ts
│   ├── specialistSelf.routes.ts
│   ├── sessions.routes.ts
│   ├── whychooseus.routes.ts
│   ├── landingcontent.routes.ts
│   └── admin/
│       ├── admin.content.routes.ts
│       └── admin.users.routes.ts
│
├── controllers/
│   ├── content.controller.ts
│   ├── reviews.controller.ts
│   ├── bookings.controller.ts
│   ├── me.controller.ts
│   ├── patient.controller.ts
│   ├── progress.controller.ts
│   ├── specialists.controller.ts
│   ├── specialistProfile.controller.ts
│   ├── specialistSchedule.controller.ts
│   ├── specialistSelf.controller.ts
│   ├── sessionReports.controller.ts
│   ├── whyChooseUs.controller.ts
│   ├── landing.controller.ts
│   ├── users.controller.ts
│   └── admin/
│       ├── content.controller.ts
│       ├── users.controller.ts
│       ├── bookings.controller.ts
│       └── stats.controller.ts
│
├── services/
│   ├── content.service.ts
│   ├── reviews.service.ts
│   ├── bookings.service.ts
│   ├── me.service.ts
│   ├── patient.service.ts
│   ├── progress.service.ts
│   ├── specialists.service.ts
│   ├── specialistProfile.service.ts
│   ├── specialistSchedule.service.ts
│   ├── sessionReports.service.ts
│   ├── whyChooseUs.service.ts
│   ├── landing.service.ts
│   ├── users.service.ts
│   └── admin/
│       ├── content.service.ts
│       ├── users.service.ts
│       ├── bookings.service.ts
│       └── stats.service.ts
│
├── schemas/                      # Zod schemas
│   ├── content.schema.ts
│   ├── specialists.schema.ts
│   ├── specialistSchedule.schema.ts
│   ├── sessionReports.schema.ts
│   ├── progress.schema.ts
│   ├── patient.schema.ts
│   └── user.schema.ts
│
├── lib/                          # Shared utilities
│   ├── supabase-storage.ts       # Multer config + Supabase upload helper
│   └── content-upload.ts         # PDF upload config
│
├── middleware/
│   ├── clerkAuth.middleware.ts
│   └── auth.middleware.ts
│
├── config/
│   └── clerk.ts
│
├── db/
│   └── supabase.ts               # pg Pool + Supabase client
│
└── libs/
    ├── user.ts                   # assertAdmin, getDbUserId
    ├── googleCalendar.ts         # Calendar event helpers
    └── mailer.ts                 # Email helpers
```

---

## 🔌 API Endpoints

### Public
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/content` | List content with filters |
| `GET` | `/api/content/:id` | Get content item (access-gated) |
| `GET` | `/api/specialist` | List available specialists |
| `GET` | `/api/specialist/:userId` | Get specialist public profile |
| `GET` | `/api/specialist/:userId/bookings` | Specialist day availability |
| `GET` | `/api/why-choose-us` | Landing "why choose us" cards |
| `GET` | `/api/landing/quote` | Landing page quote |
| `GET` | `/api/landing/why` | Landing why-cards |

### Authenticated (any role)
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/me` | Own profile (upserts from Clerk) |
| `PATCH` | `/api/me` | Update own profile |
| `GET` | `/api/me/access` | Own role + subscription status |
| `POST` | `/api/bookings` | Create a booking |
| `GET` | `/api/bookings/my` | My bookings |
| `GET` | `/api/bookings/:id` | Get one booking |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel own booking |
| `GET` | `/api/content/:id/reviews` | List reviews |
| `POST` | `/api/content/:id/reviews` | Submit a review |
| `PUT` | `/api/content/:id/reviews/mine` | Edit own review |
| `DELETE` | `/api/content/:id/reviews/mine` | Delete own review |
| `POST` | `/api/progress` | Upsert content progress |
| `GET` | `/api/progress/continue` | "Continue watching" list |
| `GET` | `/api/content/:id/progress` | Progress for one item |
| `GET` | `/api/content/:id/history` | History timeline |
| `GET` | `/api/patient/profile` | Own patient profile |
| `PATCH` | `/api/patient/profile` | Update own patient profile |
| `GET` | `/api/patient/reports` | Own session reports |
| `GET` | `/api/patient/reports/:id` | One session report |

### Specialist
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/me/specialist-profile` | Own specialist profile |
| `PATCH` | `/api/me/specialist-profile` | Update own specialist profile |
| `GET` | `/api/sessions/bookings` | Own bookings list |
| `PATCH` | `/api/sessions/bookings/:id` | Update booking status |
| `GET` | `/api/specialistSchedules/schedule` | Weekly schedule view |
| `GET` | `/api/specialistSchedules/schedule/blocks` | Availability blocks |
| `POST` | `/api/specialistSchedules/schedule/blocks` | Add availability block |
| `DELETE` | `/api/specialistSchedules/schedule/blocks/:id` | Remove block |
| `GET` | `/api/specialist/patients` | My patients list |
| `GET` | `/api/specialist/patients/:id` | One patient detail |
| `PATCH` | `/api/specialist/patients/:id/profile` | Update patient profile |
| `GET` | `/api/specialist/patients/:id/reports` | Patient reports |
| `POST` | `/api/specialist/patients/:id/reports` | Create report |
| `PATCH` | `/api/specialist/reports/:id` | Edit report |
| `DELETE` | `/api/specialist/reports/:id` | Delete report |

### Admin
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/content` | List all content |
| `POST` | `/api/admin/content` | Create content item |
| `GET` | `/api/admin/content/:id` | Get content with details |
| `PATCH` | `/api/admin/content/:id` | Partial update |
| `PUT` | `/api/admin/content/:id` | Full replace |
| `DELETE` | `/api/admin/content/:id` | Delete content |
| `GET` | `/api/admin/users/search` | Search users |
| `PATCH` | `/api/admin/users/:id/subscription` | Toggle subscription |
| `POST` | `/api/admin/users/:id/content/:contentId/access` | Grant content access |
| `DELETE` | `/api/admin/users/:id/content/:contentId/access` | Revoke content access |
| `GET` | `/api/admin/bookings` | All bookings |
| `PATCH` | `/api/admin/bookings/:id/status` | Override booking status |
| `DELETE` | `/api/admin/bookings/:id` | Delete booking |
| `GET` | `/api/me/stats/subscribers` | Active subscriber count |
| `GET` | `/api/me/stats/today-sessions` | Today's session count |
| `PATCH` | `/api/landing/quote` | Update landing quote |
| `POST` | `/api/landing/why` | Add why-card |
| `PATCH` | `/api/landing/why/reorder` | Bulk reorder why-cards |
| `PATCH` | `/api/landing/why/:id` | Update why-card |
| `DELETE` | `/api/landing/why/:id` | Delete why-card |

---

## ⚙️ Getting Started

### Prerequisites
- Node.js ≥ 18
- A Supabase project with the ANA schema applied
- A Clerk application
- Google Cloud project with Calendar API enabled (for booking confirmations)

### 1. Clone and install

```bash
git clone https://github.com/AlaaMuhissen/pure_self_backend.git
cd pure_self_backend
npm install
```

### 2. Environment variables

Create `.env` in the project root:

```env
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...

# Storage
SUPABASE_STORAGE_BUCKET=content-files

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
GOOGLE_REFRESH_TOKEN=...

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...

# Server
PORT=3000
NODE_ENV=development
```

### 3. Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

The API will be available at `http://localhost:3000`.

---

## 🔐 Authentication

All protected routes use Clerk JWT verification via the `clerkAuth` middleware. The middleware attaches `req.auth` with:

```typescript
{
  clerkUserId: string   // Clerk's user ID
  userId:      string   // internal DB UUID
  role:        "user" | "specialist" | "admin"
}
```

Admin routes additionally call `assertAdmin(clerkId)` which verifies the `role` field in the local `users` table.

---

## 📦 Content Types

The platform supports four content types, each with a type-specific details table:

| Type | Details table | Extra fields |
|---|---|---|
| `video` | `content_video_details` | `video_url`, `video_seconds`, `provider` |
| `book` | `content_book_details` | `pdf_url`, `pages`, `isbn` |
| `article` | `content_article_details` | `source_url`, `reading_minutes`, `author`, `pdf_url` |
| `session` | `content_session_details` | `therapist_id`, `session_minutes`, `meeting_type` |

File uploads (PDFs and cover images) are stored in Supabase Storage under the `content-files` bucket and referenced by public URL.

---

## 📄 License

Private — all rights reserved © 2025 ANA

---

<div align="center">
  <p>Built with ❤️ for Arabic-speaking women</p>
  <p><strong>أنا — لأنكِ تستحقين</strong></p>
</div>
