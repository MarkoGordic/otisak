# Ugrađeni demo ispit

Pri svakom pokretanju server proverava da li postoji ispit sa naslovom `Šaljivi test: crtani junaci`. Ako ne postoji, pravi ga.

Predložak je `server/src/seeds/saljivi-test.json`. Učitava se kroz `import` u vreme prevođenja koda i putuje unutar Docker slike. Nema nikakve zavisnosti na fajlovima u vreme rada.

## Šta se pravi

`ensureDemoExam()` u `server/src/bootstrap.ts` se izvršava posle `ensureBootstrapAdmin()`. Radi sledeće:

1. Nalazi ili pravi predmet `Demo` (oznaka `DEMO`).
2. Poziva `importExamFromJson(saljivi, adminId, ...)` sa zadatim vrednostima: `exam_mode = practice`, `self_service = true`, `is_public = true`, `status = active`.
3. Postavlja kao vlasnika prvog admina iz tabele.

Gde se pojavljuje:

- Studenti: u tabu **Vežba** na početnoj strani. Vidi se i kad je globalni prekidač za vežbu isključen, jer je ispit javan.
- Admin i asistenti na predmetu Demo: u `/manage`, kao i bilo koji drugi ispit.

## Idempotentnost

Provera je `SELECT id FROM otisak_exams WHERE title = 'Šaljivi test: crtani junaci'`. Na svim narednim pokretanjima taj red postoji pa se ništa ne dešava.

Da se demo resetuje: obriši ga iz `/manage`. Sledeće pokretanje će ga ponovo posejati.

## Trajno uklanjanje demo-a

Postoje dve opcije:

- Ukloni poziv `ensureDemoExam()` iz `server/src/index.ts` i obriši postojeći ispit iz `/manage`.
- Ili promeni naslov u JSON-u tako da provera ne pronađe ništa. Tako fajl ostaje, a demo se ne pravi automatski.

## Zamena demo-a

1. Izvezi svoj ispit iz `/manage` (dugme **JSON**).
2. Zameni `server/src/seeds/saljivi-test.json` tim fajlom.
3. Obriši postojeći demo iz `/manage` da bi novi naslov bio prihvaćen.
4. Ponovo izgradi sliku i restartuj.

Provera ide po naslovu. Ako tvoja zamena ima isti naslov kao postojeći demo, postojeći red je u putu. Ili promeni naslov u JSON-u, ili prvo obriši stari red.
