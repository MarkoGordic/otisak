# Global settings

Screen: `/admin/settings`. Backed by the `app_settings` key-value table.

The server enforces a whitelist of writable keys. Anything else returns `400 Unknown setting key`. This stops typos from creating garbage rows.

## Practice mode

Key: `practice_mode_enabled`. Values: `true` or `false`. Default `false`.

- **Off**. The student `/api/otisak/practice` endpoint hides private practice exams. Public practice exams (the built-in demo and anything an admin marked `is_public`) still show. The dashboard is never completely empty.
- **On**. The **Vežba** tab shows all self-service practice exams the student is enrolled in or that are public.

Has no effect on real exams.

## Info cards

The settings page also has two shortcut cards (not actual settings):

- **Upravljaj predmetima** to `/subjects`.
- **Upravljaj korisnicima** to `/admin/users`.

And one explainer card for lockdown, which is operated from the exam room, not here. See [`../assistant/running-the-room.md`](../assistant/running-the-room.md).

## Adding a new setting

1. Add the key to `ALLOWED_SETTING_KEYS` in `server/src/routes/admin.ts`.
2. Read with `getSetting('your_key')` from `server/src/db/settings.ts`.
3. Add a control card to `client/src/pages/AdminSettingsPage.tsx`.
4. Wire through `PATCH /api/admin/settings` with `{ your_key: value }`.

## API

| Endpoint | Body / Use |
|---|---|
| `GET /api/admin/settings` | `{ key: value, ... }` |
| `PATCH /api/admin/settings` | `{ key: value, ... }`. Whitelist-checked. |
