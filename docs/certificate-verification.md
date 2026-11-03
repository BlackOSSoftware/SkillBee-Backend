# Public certificate verification

`GET /api/v1/certificates/verify/:code`

- No authentication
- Rate limited
- `Cache-Control: no-store`
- Reads MongoDB directly (not Redis)

## Responses
| Status | Meaning |
|--------|---------|
| `valid` | Active issued certificate |
| `revoked` | Includes revokedAt + reason |
| `expired` | If expiration status used |
| `not_found` | Unknown/invalid code (HTTP 404) |

Public payload excludes email, phone, Mongo IDs, enrollment details, and PDF paths.
