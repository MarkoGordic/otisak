# Upravljanje korisnicima

## Kreiranje i uvoz korisnika

Na stranici "Korisnici" postoji dva načina za kreiranje korisnika: ručno kreiranje pojedinačnih korisnika i uvoz korisnika putem CSV datoteke.

![Dodavanje korisnika](../assets/image-6.png)

### Ručno kreiranje korisnika

Klikom na dugme "Dodaj korisnika" otvara se forma za kreiranje novog korisnika. Potrebno je uneti:
1. Email korisnika
2. Lozinku
3. U polje "Ime" je potrebno uneti ime i prezime korisnika, odvojene razmakom.
4. Indeks u formatu "xxyyy-zzzz", gde je xx šifra smera, yyy je redni broj studenta, a zzzz je godina upisa.
5. Izabrati ulogu korisnika (Student, Asistent ili Profesor).

Klikom na dugme "Napravi korisnika" korisnik će biti kreiran i prikazan u listi korisnika.

![Forma za kreiranje korisnika](../assets/image-7.png)

### Uvoz korisnika putem CSV datoteke

Klikom na dugme "Uvezi CSV" otvara se sistemska forma za odabir datoteke. Potrebno je odabrati CSV datoteku sa korisnicima. CSV datoteka treba da bude u sledećem formatu:

```
email,lozinka,ime,indeks,uloga
user1@example.com,password1,John Doe,in1-2023,Student
user2@example.com,password2,Jane Smith,in2-2023,Student
```

Nakon uspešnog uvoza, korisnici će biti prikazani u listi korisnika.

## Izmena podataka o korisniku

U listi postojećih korisnika, klikom na ikonicu olovke pored korisnika otvara se forma za izmenu podataka o korisniku. U ovoj formi možete promeniti email, ime, indeks i ulogu korisnika. Nakon unosa izmena, klikom na dugme "Sačuvaj" promene će biti sačuvane i prikazane u listi korisnika. Takođe, moguća je i deaktivacija naloga.

![Forma za izmenu korisnika](../assets/image-8.png)

![Forma za izmenu korisnika](../assets/image-9.png)

## Sinhronizacija sa IPA-om

Kada je uključena prijava preko FreeIPA naloga, OTISAK sam održava spisak korisnika: svako ko ima nalog na IPA-i ima nalog i u OTISAK-u, i pre nego što se prvi put prijavi. Sinhronizacija se pokreće automatski (podrazumevano jednom na sat), a može se pokrenuti i ručno dugmetom "Sinhronizuj sada" na vrhu stranice "Korisnici".

Pri svakoj sinhronizaciji:

- Novi nalozi sa IPA-e se dodaju. Studentima se kao broj indeksa upisuje njihovo korisničko ime.
- Postojeći nalozi (na primer, uvezeni iz CSV-a) se povezuju sa IPA nalogom po email-u ili broju indeksa, umesto da nastane duplikat.
- Ime, email i uloga se ažuriraju prema IPA-i. Administratori se nikada ne degradiraju automatski.
- Ko je obrisan sa IPA-e ili onemogućen na njoj, **arhivira se**: nalog se deaktivira, ali se ne briše, pa njegovi rezultati i polaganja ostaju sačuvani. Ako se nalog kasnije vrati na IPA-u, automatski se ponovo aktivira.

Nalozi sa IPA-e u listi imaju oznaku "IPA", a arhivirani oznaku "Arhiviran", uz razlog i datum. Arhivirani i deaktivirani nalozi se vide kada se u filteru statusa izabere "Neaktivni i arhivirani".

Ako bi se odjednom arhivirao neuobičajeno veliki broj naloga (podrazumevano više od 10%), arhiviranje se zadržava, jer to češće znači da IPA trenutno nije dostupna nego da su ljudi zaista obrisani. Ostale izmene se ipak primenjuju, a na stranici se pojavljuje upozorenje sa dugmetom "Potvrdi arhiviranje".

Ako arhiviran nalog ručno ponovo aktivirate, on se odvaja od IPA-e i postaje lokalni nalog. Takvom nalogu postavite lozinku da bi korisnik mogao da se prijavi. Nalog koji je administrator ručno deaktivirao sinhronizacija nikada ne aktivira sama.

## Promena lozinke

U listi postojećih korisnika, klikom na ikonicu ključa pored korisnika otvara se forma za promenu lozinke. U ovoj formi potrebno je uneti novu lozinku koja mora imati najmanje 6 karaktera. Nakon unosa nove lozinke, klikom na dugme "Sačuvaj" lozinka će biti promenjena i korisnik će moći da se prijavi novom lozinkom.

![Forma za promenu lozinke](../assets/image-10.png)

![Forma za promenu lozinke](../assets/image-11.png)