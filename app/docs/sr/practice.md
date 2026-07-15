# Vežbe

Stranica: `/practice`, stavka **Upravljanje vežbama** u bočnoj traci.

Vežba je ispit koji student pokreće sam, kad god hoće i koliko god puta hoće. Nema sobe, nema spiska prijavljenih, nema nadzora. Pravi ispiti imaju svoju stranicu na `/manage`.

## Pravi ispit ili vežba

| | Pravi ispit (`/manage`) | Vežba (`/practice`) |
|---|---|---|
| Ko pokreće | Ti, iz sobe | Student, bilo kada |
| Prijava | Obavezna | Nije potrebna |
| Čekaonica i tajmer | Studenti čekaju, ti pokrećeš tajmer | Kreće odmah na klik |
| Soba za nadzor | Da | Ne |
| Pokušaji | Jedan | Neograničeno |
| Rezultati | Izvoze se za celu grupu | Odmah, studentu |

**Režim se određuje pri kreiranju ispita i ne može da se promeni kasnije.** Odlučuje ga stranica na kojoj praviš ili uvoziš ispit. To je namerno: ispit ne može da odluta između dve stranice, a editor prikazuje režim kao oznaku koja se ne menja, umesto kao padajuću listu.

## Kreiranje

**Ručno.** `/practice`, **Nova vežba**. Naslov, predmet i trajanje. Čuva se kao nacrt.

Ovde je **predmet obavezan**, za razliku od `/manage`. Vežba bez predmeta može da se napravi, ali student koji klikne Pokreni dobija grešku, pa je forma unapred sprečava.

**Iz JSON-a.** `/practice`, **Uvezi JSON**. Izaberi fajl i predmet. Ispit se uvek pravi kao vežba, bez obzira na to šta piše u fajlu. Vidi [JSON format ispita](json-format.md).

Ako je fajl izvezen iz starije verzije i još uvek ima polje `exam_mode`, uvoz radi, a aplikacija ti javi da je polje zanemareno.

## Šta stranica podešava umesto tebe

Kreiranje ili uvoz na `/practice` označava ispit kao samoposlužni i javni. To ne podešavaš ručno: proizlazi iz režima.

To znači da je vežba vidljiva **svim** studentima, ne samo upisanima. Ipak, ništa se ne otkriva u trenutku uvoza: uvezen ispit je nacrt, a studenti ga vide tek kada ga objaviš.

## Objavljivanje

Kartice na `/practice`:

- **Objavljene**: studenti ih upravo sada vide i mogu da ih pokrenu.
- **Nacrti**: još se pišu. Nevidljivi studentima.
- **Arhiva**: sklonjeno, plus sve završeno.

**Objavi** na nacrtu ga pušta u rad. **Arhiviraj** ga sklanja. Nema dugmeta za povlačenje objave: umesto toga arhiviraj.

Svaki red ima oznaku vidljivosti:

| Oznaka | Značenje |
|---|---|
| **Javna** | Vide je svi studenti. |
| **Samo upisani** | Vide je samo studenti upisani na predmet. |
| **Skrivena od studenata** | Nešto nije u redu, vidi ispod. |

### Skrivena od studenata

Crvena oznaka **Skrivena od studenata** znači da ispit nije označen kao samoposlužni, pa nikad ne stiže do liste vežbi kod studenata, čak ni kada je objavljen.

Vežbe uvezene starijim verzijama aplikacije imaju taj problem: uvoz ih nije označavao kao samoposlužne, pa su bile tiho nevidljive. Klikni **Objavi ponovo** na redu da se popravi.

Novi uvozi nemaju taj problem.

## Kako i osoblje radi vežbe

Osoblje radi vežbe kroz studentski prikaz: stavka **Vežbanje** u bočnoj traci. To je druga stavka od **Upravljanje vežbama**, a to je ova stranica.

Administratori vide sve samoposlužne vežbe. Asistenti vide javne i one sa svojih predmeta. Prave ispite i dalje rade samo studenti.

## Globalni prekidač za vežbe

Na `/admin/settings` postoji **practice_mode_enabled**, i **podrazumevano je isključen**.

Kada je isključen, studenti i dalje vide **javne** vežbe, pa im tabla nikad nije prazna i ugrađeni demo i dalje radi. Vežbe ograničene na upisane studente ostaju skrivene dok ga ne uključiš. Na osoblje ne utiče.

## Demo ispit

Sveža instalacija dobija jednu javnu vežbu, da uvek postoji nešto za probu. Ona je zaključana: ne može da se završi, arhivira ni obriše, i ne može da joj se promeni naslov ni predmet. Sve ostalo (trajanje, prag, pitanja) može da se menja.

## Šta ova stranica ne radi

- **Nema sobe ni praćenja uživo.** Šablon nema spisak prijavljenih. Svaki studentov pokušaj pravi svoju skrivenu kopiju iza scene.
- **Nema statistike ni izvoza rezultata.** Pokušaji pripadaju tim kopijama, a ne šablonu, pa bi oba ovde uvek bila prazna.
- **Nema generisanja iz banke pitanja.** Server podržava nasumične vežbe iz banke, ali za to nema korisničkog interfejsa. Vidi [Upravljanje ispitima](exams.md).
