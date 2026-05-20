# Globalna podešavanja

Ekran: `/admin/settings`. Iza je `app_settings` key-value tabela.

Server drži whitelist ključeva. Ostalo vraća `400 Unknown setting key`. Tako tipfeleri ne pravi đubre u bazi.

## Režim vežbe

Ključ: `practice_mode_enabled`. Vrednosti: `true` ili `false`. Default `false`.

- **Off**. Student `/api/otisak/practice` endpoint sakriva privatne vežba ispite. Javni vežba ispiti (ugrađeni demo i sve što je admin označio kao `is_public`) ostaju vidljivi. Dashboard nikad nije potpuno prazan.
- **On**. **Vežba** tab pokazuje sve self-service vežba ispite na koje je student upisan ili koji su javni.

Bez efekta na prave ispite.

## Info kartice

Stranica ima i dve shortcut kartice (nisu stvarna podešavanja):

- **Upravljaj predmetima** na `/subjects`.
- **Upravljaj korisnicima** na `/admin/users`.

I jednu kartu sa objašnjenjem za lockdown, koji se pokreće iz sobe, ne odavde. Vidi [`../assistant/running-the-room.md`](../assistant/running-the-room.md).

## Dodavanje novog podešavanja

1. Dodaj ključ u `ALLOWED_SETTING_KEYS` u `server/src/routes/admin.ts`.
2. Čitaj sa `getSetting('tvoj_kljuc')` iz `server/src/db/settings.ts`.
3. Dodaj karticu na `client/src/pages/AdminSettingsPage.tsx`.
4. Wire-uj kroz `PATCH /api/admin/settings` sa `{ tvoj_kljuc: vrednost }`.

## API

| Endpoint | Body / Upotreba |
|---|---|
| `GET /api/admin/settings` | `{ key: value, ... }` |
| `PATCH /api/admin/settings` | `{ key: value, ... }`. Whitelist-checked. |
