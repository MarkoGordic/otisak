# Ugrađeni demo ispit

Svako pokretanje proverava da li postoji ispit sa naslovom `Šaljivi test: crtani junaci`. Ako ne postoji, kreira ga.

Fixture je `server/src/seeds/saljivi-test.json`. Učitava se preko `import` u vreme kompajliranja i putuje unutar Docker image-a. Bez runtime zavisnosti.

## Šta se kreira

`ensureDemoExam()` u `server/src/bootstrap.ts` se izvršava posle `ensureBootstrapAdmin()`. Radi:

1. Pronalazi ili kreira `Demo` predmet (kod `DEMO`).
2. Poziva `importExamFromJson(saljivi, adminId, ...)` sa overrides: `exam_mode = practice`, `self_service = true`, `is_public = true`, `status = active`.
3. Postavlja kreatora na prvog admina u tabeli.

Gde se pojavljuje:

- Studenti: u **Vežba** tabu na Dashboard-u. Vidljiv i kad je globalni practice toggle isključen jer je ispit javan.
- Admin i asistenti na Demo predmetu: u `/manage` kao bilo koji drugi ispit.

## Idempotentnost

Provera je `SELECT id FROM otisak_exams WHERE title = 'Šaljivi test: crtani junaci'`. Na narednim pokretanjima taj red postoji pa se ništa ne dešava.

Da resetuješ demo: obriši ga iz `/manage`. Sledeće pokretanje ga ponovo seeduje.

## Trajno uklanjanje demo-a

Ili:

- Ukloni `ensureDemoExam()` poziv iz `server/src/index.ts` i obriši postojeći ispit iz `/manage`.
- Ili preimenuj naslov u JSON-u da lookup ne radi, ako želiš da fajl ostane ali da se ne seeduje automatski.

## Zamena demo-a

1. Eksportuj svoj ispit iz `/manage` (**JSON** dugme).
2. Zameni `server/src/seeds/saljivi-test.json` tim fajlom.
3. Obriši postojeći demo iz `/manage` da bi se novi naslov pokupio.
4. Rebuild i restart.

Lookup je po naslovu. Ako tvoja zamena drži isti naslov kao postojeći demo, postojeći red ga blokira. Ili preimenuj naslov u JSON-u, ili prvo obriši stari red.
