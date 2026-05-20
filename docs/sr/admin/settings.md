# Globalna podešavanja

Ekran: `/admin/settings`. Iza je tabela `app_settings` (parovi ključ–vrednost).

Server drži belu listu ključeva koji smeju da se upisuju. Sve ostalo vraća `400 Unknown setting key`. Time se sprečava da omaška napravi neispravan red u bazi.

## Režim vežbe

Ključ: `practice_mode_enabled`. Vrednosti: `true` ili `false`. Podrazumevano `false`.

- **Isključeno**. Studentska putanja `/api/otisak/practice` skriva privatne vežba-ispite. Javni vežba-ispiti (ugrađeni demo i sve što je admin označio sa `is_public`) ostaju vidljivi. Početni ekran nikad nije sasvim prazan.
- **Uključeno**. Tab **Vežba** prikazuje sve samostalne vežba-ispite na koje je student upisan ili koji su javni.

Nema uticaja na prave ispite.

## Informativne kartice

Stranica ima i dva prečice (nisu prava podešavanja):

- **Upravljaj predmetima** vodi na `/subjects`.
- **Upravljaj korisnicima** vodi na `/admin/users`.

I jednu karticu sa objašnjenjem zabrane rada, koja se pokreće iz sobe, ne odavde. Vidi [`../assistant/running-the-room.md`](../assistant/running-the-room.md).

## Dodavanje novog podešavanja

1. Dodaj ključ u `ALLOWED_SETTING_KEYS` u `server/src/routes/admin.ts`.
2. Pročitaj ga sa `getSetting('tvoj_kljuc')` iz `server/src/db/settings.ts`.
3. Dodaj karticu u `client/src/pages/AdminSettingsPage.tsx`.
4. Poveži ga preko `PATCH /api/admin/settings` sa telom `{ tvoj_kljuc: vrednost }`.

## API

| Putanja | Telo / Upotreba |
|---|---|
| `GET /api/admin/settings` | `{ key: value, ... }` |
| `PATCH /api/admin/settings` | `{ key: value, ... }`. Proverava se bela lista. |
