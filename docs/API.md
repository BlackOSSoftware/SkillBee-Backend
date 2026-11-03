# Skillbee API — Phase 1 Auth & User Management

Base URL: `/api/v1`

Interactive docs: `/api/v1/docs`

## Auth — `/api/v1/auth`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/auth/register` | No | Student registration |
| POST | `/auth/login` | No | Login |
| POST | `/auth/refresh` | Refresh token | Rotate tokens |
| POST | `/auth/logout` | Access JWT | Logout |
| POST | `/auth/forgot-password` | No | Password reset request |
| POST | `/auth/reset-password` | No | Set new password |
| GET | `/auth/me` | Access JWT | Logged-in user |

Register body:

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "phone": "+91 98765 43210",
  "password": "Secret123",
  "profile": { "education": "BSc CS" }
}
```

## Admin users — `/api/v1/admin/users`

Requires `admin` or `super_admin` plus matching permissions.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/users` | List users (filters: `search`, `status`, `role`, `roleId`, `page`, `limit`, `includeDeleted`) |
| POST | `/admin/users` | Create user |
| GET | `/admin/users/:id` | User details |
| PATCH | `/admin/users/:id` | Update user |
| DELETE | `/admin/users/:id` | Soft delete |
| PATCH | `/admin/users/:id/status` | Activate / deactivate / suspend |

## Admin roles & permissions

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/roles` | List roles |
| POST | `/admin/roles` | Create role |
| PATCH | `/admin/roles/:id` | Update role |
| DELETE | `/admin/roles/:id` | Delete unused (non-system) role |
| GET | `/admin/permissions` | List permissions |
| PATCH | `/admin/roles/:id/permissions` | Assign permissions |

## User fields

- `firstName`, `lastName`, `email`, `phone`, `passwordHash`
- `profileImage`, `roleId`, `status`, `emailVerified`, `phoneVerified`
- `lastLogin`, `profile` (role-specific Mixed), `createdAt`, `updatedAt`, `deletedAt`

## Rules

- Email unique among non-deleted users
- Password hashed with bcrypt (`passwordHash`)
- Phone normalized (e.g. `+91 98765 43210` → `+919876543210`)
- Permissions checked on backend (`requirePermissions`)
- Soft delete via `deletedAt`
- Cannot soft-delete / deactivate the last active `super_admin`

## Default roles

| Slug | Notes |
|------|-------|
| `super_admin` | Full access; protected last-active rule |
| `admin` | Users + roles management |
| `student` | Default public registration role |
