# Vođenje sobe

Soba je `/manage/:examId`. Dostupna je za svaki ispit u statusu `active`. To je tvoj komandni panel tokom ispita.

## Raspored

Tri zone:

1. **Zaglavlje**. Naslov, status, vreme, glavna dugmad.
2. **Tabla napretka uživo**. Napredak po studentu.
3. **Red zahteva**. Zahtevi za naknadan ulazak i drugi zahtevi koji čekaju tvoj odgovor.

Podaci se osvežavaju preko WebSocket-a na svaki događaj (`exam.started`, `student.joined`, `student.submitted`, `request.created`, `lockdown.changed`). Ako veza padne, REST proverava svakih 5 sekundi kao rezerva.

## Pokretanje vremena

Kad je ispit `active` a vreme još nije krenulo, soba pokazuje **Pokreni tajmer**.

Klikom se postavlja `exam_started_at = now`, izračuna se rok kao `exam_started_at + duration_minutes`, i šalje se događaj `exam.started` svima. Studenti se prebacuju sa ekrana "čekanje" na ekran ispita.

Posle pokretanja, rok je zaključan.

## Podešavanje vremena

**Podesi tajmer** dodaje ili oduzima sekunde. Server menja `extra_seconds` na ispitu. Svi klijenti odmah dobijaju novi rok.

Pozitivne vrednosti su uobičajene (pad mreže, požarni alarm). Negativne su podržane ali se retko koriste.

## Zabrana rada

**Zabrani rad** zaustavlja ispit:

- Studenti vide crveni ekran preko cele površine.
- Vreme im se pauzira.
- Unos odgovora je blokiran.

Polje za poruku je opciono. Poruka se prikazuje svima.

**Otpusti** sklanja zabranu.

Iza scene: red u tabeli `exam_lockdowns`. Trajanje pauze se sabira i dodaje na svaki studentov rok.

Koristi: za prigovor, lošu mrežu, požarni alarm, sve što zahteva da se vreme zaustavi za sve.

## Zahtevi za naknadan ulazak

Ako student pokuša da uđe posle pokretanja vremena, dobija dugme koje pravi zahtev. Zahtev pada u tvoj red sa imenom, brojem indeksa i vremenskim pečatom.

- **Odobri**: server pravi pokušaj, postavlja rok na trenutni rok ispita (student dobija preostalo vreme), pušta ga.
- **Odbij**: student dobija obaveštenje.

Zahtevi ostaju na čekanju dok ne odlučiš ili dok se ispit ne zatvori.

## Vidljivost po studentu

Tabla napretka pokazuje status:

| Status | Značenje |
|---|---|
| Nije pristupio | Nije ušao. |
| U toku | Ušao i odgovara. Traka napretka pokazuje odgovoreno / ukupno. |
| Predao | Predao. Vidi se konačan rezultat. |

Klik na red otvara napredak po pitanju i vreme početka.

## Zatvaranje ispita

Dve opcije, obe pri dnu sobe:

- **Završi**. Server postavlja status `completed`, predaje nezavršene pokušaje (sa onim što je sačuvano), i šalje `exam.finished` svima. Studenti izlaze sa ekrana ispita.
- **Završi sve i preusmeri**. Isto, uz oznaku `redirect: true` koja studente vodi na početnu stranu umesto na ekran rezultata.

Obe su konačne. Baza ne dozvoljava povratak `completed` → `active`.

## Posle zatvaranja

Soba je samo za čitanje, ali možeš:

- Da otvoriš izveštaje po studentu sa table napretka.
- Da izvezeš CSV i PDF po studentu (vidi [`after-the-exam.md`](after-the-exam.md)).
- Da pokreneš AI ocenjivanje za otvorene odgovore ako nisi koristio inline režim.
