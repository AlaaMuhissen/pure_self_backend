# PureSelf Backend API

Backend server for the PureSelf platform — a role-based content and specialist management system built with Node.js, Express, TypeScript, PostgreSQL, Supabase, and Clerk Authentication.

---

# About The Project

PureSelf is a modern platform focused on delivering digital content and specialist services through a secure and scalable system.

The backend handles:

- Authentication & authorization
- Role management
- Content management
- Booking sessions
- Subscription handling
- File uploads
- Protected admin APIs
- Database operations
- Storage integration
- User synchronization with Clerk

The platform supports multiple content types including:

- Videos
- Articles
- Books
- Sessions

---

# Tech Stack

## Backend

- Node.js
- Express.js
- TypeScript

## Database & Storage

- PostgreSQL
- Supabase
- Supabase Storage

## Authentication

- Clerk Authentication

## Validation & Utilities

- Zod
- dotenv
- cors
- uuid

---

# Features

## Authentication

- Clerk-based authentication
- Protected API routes
- Bearer token authorization
- User synchronization between Clerk and PostgreSQL

## User Management

- User profile management
- Role-based access control
- Subscription tracking
- Admin/user/specialist roles

## Content System

Supports multiple content types:

- Videos
- Articles
- Books
- Sessions

Each content type can contain:

- Title
- Description
- Preview
- Pricing
- Media
- Published state
- Type-specific metadata

## Admin Dashboard APIs

Admins can:

- Create content
- Delete content
- Manage users
- Control access
- Upload media/files

## File Uploads

Supports:

- Image uploads
- PDF uploads
- Supabase Storage integration

## Booking System

- Create bookings
- Manage booking status
- Specialist session handling

---

# Project Structure

```txt
src/
│
├── app.ts
├── server.ts
│
├── db/
│   ├── pool.ts
│   └── queries/
│
├── routes/
│   ├── admin.routes.ts
│   ├── content.routes.ts
│   ├── bookings.routes.ts
│   ├── me.routes.ts
│   └── specialists.routes.ts
│
├── middleware/
│   ├── auth.middleware.ts
│   ├── requireAdmin.ts
│   └── errorHandler.ts
│
├── lib/
│   ├── clerk.ts
│   ├── supabase.ts
│   └── storage.ts
│
├── services/
│
├── schemas/
│
├── utils/
│
├── types/
│
└── constants/
```

---

# Installation

## 1. Clone Repository

```bash
git clone https://github.com/AlaaMuhissen/pure_self_backend.git
```

## 2. Enter Project Folder

```bash
cd pure_self_backend
```

## 3. Install Dependencies

```bash
npm install
```

---

# Environment Variables

Create a `.env` file in the project root.

## Example `.env`

```env
PORT=8080

DATABASE_URL=

CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
```

---

# Important Security Notes

Never upload:

- `.env`
- API keys
- Clerk secret keys
- Supabase service role keys

Make sure `.env` is included in `.gitignore`.

---

# Running The Project

## Development Mode

```bash
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

---

# Authentication

This backend uses Clerk authentication.

Protected routes require:

```http
Authorization: Bearer YOUR_TOKEN
```

---

# API Overview

---

# Current User

## Get Current User

```http
GET /api/me
```

Returns the authenticated user from the database.

---

# Content APIs

## Get All Published Content

```http
GET /api/content
```

### Query Parameters

| Parameter | Description |
|---|---|
| type | video/article/book/session |
| freeOnly | returns only free content |
| published | published items only |
| q | search query |
| limit | pagination |
| offset | pagination |

---

## Get Content By ID

```http
GET /api/content/:id
```

Returns detailed information for a specific content item.

---

# Admin APIs

Protected admin routes.

---

## Create Content

```http
POST /api/admin/content
```

Supports:

- Videos
- Articles
- Books
- Sessions

---

## Delete Content

```http
DELETE /api/admin/content/:id
```

---

## Get Users

```http
GET /api/admin/users
```

---

# Bookings APIs

## Create Booking

```http
POST /api/bookings
```

---

## Get Bookings

```http
GET /api/bookings
```

---

## Update Booking Status

```http
PATCH /api/bookings/:id/status
```

---

# Database Design

The system uses PostgreSQL through Supabase.

---

# Main Tables

## users

Stores:

- Clerk user ID
- Role
- Subscription state
- Profile information

---

## content_items

Main content table.

Stores:

- Content type
- Title
- Description
- Price
- Visibility
- Preview
- Published state

---

## content_article_details

Stores article-specific fields.

---

## content_book_details

Stores:

- PDF URL
- ISBN
- Pages

---

## content_video_details

Stores:

- Video URL
- Provider
- Duration

---

## content_session_details

Stores:

- Therapist
- Session duration
- Meeting type

---

# File Uploads

Uploads are handled using Supabase Storage.

Supported uploads:

- Images
- PDFs

Files are uploaded to storage buckets and linked inside PostgreSQL records.

---

# Validation

All request bodies are validated using Zod schemas.

Examples:

- Content creation
- Booking updates
- User data

---

# Error Handling

The backend includes:

- Validation error handling
- Authentication error handling
- Database error handling
- Storage upload error handling

---

# Example Git Workflow

## Stage Files

```bash
git add .
```

## Commit Changes

```bash
git commit -m "Implement backend architecture and API endpoints"
```

## Push Changes

```bash
git push
```

---

# Deployment Notes

Before deployment:

- Set production environment variables
- Secure API keys
- Configure CORS
- Configure Supabase buckets
- Configure Clerk production keys

---

# Future Improvements

- Real-time notifications
- Payment integration
- Calendar integration
- Video streaming optimization
- AI-powered recommendations
- Analytics dashboard
- Specialist scheduling system

---

# Author

Developed by Alaa Muhissen.

Software Engineer focused on building scalable web applications and modern digital platforms.

---

# License

This project is for educational and portfolio purposes.