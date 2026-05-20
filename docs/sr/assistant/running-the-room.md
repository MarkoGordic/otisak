# Vođenje sobe

Soba je `/manage/:examId`. Dostupna za svaki ispit u `active` statusu. Kontrolni panel tokom ispita.

## Raspored

Tri zone:

1. **Header**. Naslov, status, tajmer, glavna dugmad.
2. **Live stats panel**. Napredak po studentu.
3. **Red zahteva**. Zahtevi za naknadan ulazak i drugi koji čekaju na tebe.

Podaci se osvežavaju preko WebSocket-a na svaki event (`exam.started`, `student.joined`, `student.submitted`, `request.created`, `lockdown.changed`). REST polling na 5s pada nazad ako socket padne.

## Pokretanje tajmera

Kad je ispit `active` ali nije krenuo, soba pokazuje **Pokreni tajmer**.

Klik postavlja `exam_started_at = now`, računa deadline kao `exam_started_at + duration_minutes`, i broadcast-uje `exam.started`. Studenti se prebacuju sa "čekaj" na ekran ispita.

Nakon pokretanja, deadline je zaključan.

## Podešavanje tajmera

**Podesi tajmer** dodaje ili oduzima sekunde. Server menja `extra_seconds` na ispitu. Svaki klijent dobija novi deadline odmah.

Pozitivne vrednosti su tipične (mrežni pad, požarni alarm). Negativne su podržane ali retko korisne.

## Lockdown

**Zabrani rad** pauzira ispit:

- Studenti vide crveni full-screen ekran.
- Tajmer im se pauzira.
- Unos odgovora je blokiran.

Polje za poruku je opciono, prikazuje se svima.

**Otpusti** sklanja lockdown.

Iza scene: red u `exam_lockdowns`. Vreme pauze se sabira i dodaje nazad na svaki studentov deadline.

Za: spornu prigovor, lošu mrežu, požarni alarm, bilo šta što treba da zaustavi sat za sve.

## Zahtevi za naknadan ulazak

Ako student pokuša da uđe posle starta tajmera, dobija dugme koje pravi zahtev. Sleti u tvoj red sa imenom, indeksom i timestamp-om.

- **Odobri**: server pravi attempt, postavlja deadline na trenutni deadline ispita (student dobija preostalo vreme), pušta ga.
- **Odbij**: student dobija notifikaciju.

Zahtevi ostaju pending dok ne odlučiš ili dok se ispit ne zatvori.

## Vidljivost po studentu

Live stats panel pokazuje status:

| Status | Značenje |
|---|---|
| Nije pristupio | Nije ušao. |
| U toku | Ušao i odgovara. Progress bar = odgovoreno / ukupno. |
| Predao | Predao. Konačan rezultat prikazan. |

Klik na red otvara per-question napredak i vreme starta.

## Zatvaranje ispita

Dve opcije, obe pri dnu sobe:

- **Završi**. Server označava ispit `completed`, predaje nezavršene pokušaje (sa onim što je sačuvano), broadcast-uje `exam.finished`. Studenti izlaze sa ekrana ispita.
- **Završi sve i preusmeri**. Isto plus `redirect: true` flag koji šalje studente na home umesto na ekran rezultata.

Obe su konačne. Baza blokira `completed` → `active`.

## Nakon zatvaranja

Read-only, ali možeš:

- Da otvoriš per-student izveštaje iz live stats panela.
- Da eksportuješ CSV i per-student PDF-ove (vidi [`after-the-exam.md`](after-the-exam.md)).
- Da pokreneš AI ocenjivanje za open-text odgovore ako nisi inline.
