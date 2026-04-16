# OTISAK

**Automated Test and Integrated Scoring Assessment Kernel**

A standalone exam and assessment platform built with Next.js 14, PostgreSQL, and Docker. Supports 7 question types, AI grading, question banks, practice mode, and role-based access for admins, assistants, and students.

## Quick Start

```bash
docker compose up --build
```

App runs at `http://localhost:3000`. Database is automatically initialized with a default admin account.

**Default admin login:**
- Email: `admin@otisak.local`
- Password: `admin123`

## Development

```bash
# Start only the database
docker compose up db -d

# Copy env and install
cp .env.example .env
npm install
npm run dev
```

## Features

### Roles
- **Admin** - Full system access, user management, all exam operations
- **Assistant** - Manage exams, questions, enrollments, view reports
- **Student** - Take exams, view results, access practice mode

### Exam System
- 7 question types: multiple choice, code (syntax highlighted), image, open text (AI graded), ordering, matching, fill-in-the-blank
- Configurable exam settings: duration, pass threshold, shuffle, negative points, partial scoring
- Exam lifecycle: draft > scheduled > active > completed > archived
- Auto-save every 30 seconds during exams
- Countdown timer with visual urgency indicator (turns red under 60s)
- Scratch notes panel for student calculations (not submitted)
- Bulk student enrollment by index number pattern

### Question Bank
- Centralized question repository per subject
- Tag-based organization and search
- Tag rules for dynamic exam generation from the bank
- Import/export support

### Practice Mode
- Self-service practice exams
- Template-based generation with randomized questions from the bank
- Separate tracking from real exams

### AI Grading
- Infrastructure for Claude and OpenAI grading of open-text answers
- Immediate or deferred grading modes
- Student API key support with credit limits

### UI
- Dark and light theme with toggle (defaults to dark)
- Responsive design for mobile and desktop
- Animated transitions with Framer Motion

## Tech Stack

- **Frontend:** Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Next.js API Routes, PostgreSQL (via `pg` driver)
- **Auth:** bcrypt password hashing, HMAC-signed session cookies
- **Deployment:** Docker Compose (PostgreSQL 16 + standalone Next.js)

## Project Structure

```
otisak/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes (auth, exams, subjects, questions)
│   │   ├── dashboard/          # Student/admin dashboard
│   │   ├── exam/[examId]/      # Exam taking and results pages
│   │   ├── manage/             # Exam management (admin/assistant)
│   │   ├── questions/          # Question bank (admin/assistant)
│   │   ├── admin/users/        # User management (admin only)
│   │   └── login/              # Login page
│   ├── components/
│   │   ├── otisak/             # Exam UI (header, timer, nav, answer options, code block)
│   │   └── ui/                 # Shared components (badge, button, dropdown, tabs)
│   └── lib/
│       └── db/                 # Database operations and types
├── init.sql                    # Database schema and seed data
├── Dockerfile                  # Multi-stage production build
├── docker-compose.yml          # PostgreSQL + app
└── .env.example                # Environment variables template
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://otisak:otisak@localhost:5432/otisak` |
| `SESSION_SECRET` | Secret for signing session cookies | (required) |
| `BASE_URL` | Application base URL | `http://localhost:3000` |

## License

Private.
