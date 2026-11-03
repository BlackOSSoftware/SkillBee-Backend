# Phase 14–15 — Site Settings, Firebase Notifications, Hostinger Email

## Contact / social settings

- Model: `SiteSettings` (singleton `key=default`)
- Admin: `GET/PATCH /api/v1/admin/site-settings`
- Public: `GET /api/v1/site-settings`
- No page builder / CMS

## Firebase

Set `FIREBASE_ENABLED=true` and service-account fields. Init is lazy and never logs private keys. Mock messaging is injectable in tests.

## Email (Hostinger SMTP)

Set `EMAIL_ENABLED=true` and SMTP_* credentials. Jobs go through BullMQ when Redis is enabled; otherwise an in-memory inline worker is used. Registration/payment APIs never await SMTP.

Worker: started with the API server, or `npm run worker:email`.

## Event map

See `src/services/events/eventBus.service.js` — account, enrollment, payment success/fail, assignment, quiz, certificate, password reset (email only for token link).
