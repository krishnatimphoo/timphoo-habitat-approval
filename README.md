# Timphoo Habitat Approval

Approval workspace for reviewing Timphoo habitats and trainers.

This app reuses the OTP login flow from the admin project and provides a focused approval UI for:

- Habitat review and approval
- Trainer review and approval
- Search and status filtering
- Approve, reject, and remove actions

## Features

- OTP login using the same `sendOtp` and `verifyOtp` flow used in the admin app
- Left navigation with `Habitats` and `Trainers`
- Pending-first review workflow for both sections
- Table + detail-panel approval UI
- Habitat actions:
  - Approve
  - Reject
  - Remove for SLA breach
- Trainer actions:
  - Approve
  - Reject
  - Remove
- Local proxy routes for Timphoo API calls

## Tech Stack

- Next.js 14
- React 18
- TypeScript

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Environment Variables

The app uses the Timphoo API through local proxy routes.

Optional:

```bash
TIMPHOO_API_BASE_URL=https://api.timphoo.com
```

You can also use:

```bash
NEXT_PUBLIC_TIMPHOO_API_BASE_URL=https://api.timphoo.com
```

If neither is set, the app defaults to:

```bash
https://api.timphoo.com
```

## API Routes Used

Auth:

- `POST /api/auth/otp/send`
- `POST /api/auth/otp/verify`
- `POST /api/auth/refresh`
- `GET /api/users/me`

Habitats:

- `GET /api/habitats/mine`
- `PATCH /api/habitats/:id`

Trainers:

- `GET /api/habitats/:id/mentors`
- `PATCH /api/mentors/:id`

## Notes

- Both `Habitats` and `Trainers` default to the `Pending` filter because this app is mainly intended for approval work.
- The review panel appears only after clicking an item in the list.
- Approved habitats do not show `Approve Habitat` or `Remove For SLA Breach`.
- Trainer status updates are sent to `PATCH /api/mentors/:id`. If your backend uses a different trainer approval endpoint, the UI can be switched easily.
