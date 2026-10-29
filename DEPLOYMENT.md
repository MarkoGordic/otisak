# Postavljanje i održavanje

Uputstvo za instalaciju OTISAK-a na sopstveni server. Ceo sistem radi u dva Docker kontejnera: aplikacija (Node.js server koji poslužuje i veb interfejs) i PostgreSQL baza.

```
pregledač -> reverse proxy (nginx, Caddy, Traefik...) -> app:3001 -> db:5432
```

## Preduslovi

- Linux server (ili macOS za lokalno testiranje) sa Docker-om i Docker Compose-om
- Git
- Za javni pristup: domen i reverse proxy sa HTTPS sertifikatom

## Prvo pokretanje

```bash
git clone https://github.com/MarkoGordic/otisak.git
cd otisak
./deploy.sh            # ili ./deploy.sh --port 8080
```

Skripta `deploy.sh`:

1. generiše `SESSION_SECRET` u `.env` (samo pri prvom pokretanju, kasnije ga ponovo koristi),
2. upisuje izabrani port u `.env` kao `HOST_PORT` (podrazumevano `3000`),
3. otvara port u `ufw` firewall-u, ako postoji (preskače se sa `--no-firewall`),
4. gradi i pokreće kontejnere i čeka da baza bude spremna,
5. ispisuje email i lozinku administratorskog naloga kreiranog pri prvom pokretanju.

Lozinka administratora se ispisuje **samo jednom**, odmah je sačuvajte. Ako je propustite:

```bash
docker compose logs app | grep -A3 'admin account bootstrapped'
```

Sve opcije skripte: `./deploy.sh --help`.

### Bez skripte

```bash
cp .env.example .env
# u .env postavite SESSION_SECRET, npr. vrednošću iz: openssl rand -hex 32
docker compose up -d --build
```

## Reverse proxy i HTTPS

Aplikacija sluša na `HOST_PORT` na hostu. Reverse proxy treba da prosleđuje sav saobraćaj na taj port, uključujući WebSocket konekcije na putanji `/ws` (preko njih radi praćenje ispita uživo). Primer za nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Server podrazumevano veruje jednom proxy-ju ispred sebe. Ako ih ima više, postavite `TRUST_PROXY_HOPS` kroz `docker-compose.override.yml` (primer je u odeljku o LDAP-u).

## Ažuriranje na novu verziju

```bash
cd ~/otisak
./deploy.sh
```

Skripta povlači najnoviji kod, ponovo gradi aplikaciju i restartuje je. Baza ostaje netaknuta, a izmene šeme se primenjuju automatski pri pokretanju servera.

## Administratorska lozinka

Promena lozinke administratora bez ponovnog pokretanja sistema (kontejneri moraju biti pokrenuti):

```bash
./deploy.sh --set-admin-password
```

## Načini prijave

Lokalna prijava (email i lozinka) je uvek dostupna. Pored nje mogu da se uključe dva opciona načina prijave. Sve promenljive su opisane u [`.env.example`](.env.example).

### FreeIPA / LDAP

Kada je uključena, LDAP prijava postaje podrazumevana: zaposleni i studenti se prijavljuju korisničkim imenom (studenti brojem indeksa) i lozinkom iz direktorijuma, a OTISAK nalog se kreira automatski pri prvoj prijavi. Uloga se određuje po članstvu u grupama.

`docker-compose.yml` ne prosleđuje `LDAP_*` promenljive u kontejner, pa se dodaju kroz `docker-compose.override.yml` pored njega, koji Docker Compose učitava automatski:

```yaml
services:
  app:
    environment:
      LDAP_ENABLED: "true"
      LDAP_URL: ldaps://ipa.example.org:636
      LDAP_BASE_DN: dc=example,dc=org
      LDAP_DOMAIN: example.org
      LDAP_CA_FILE: /etc/otisak/ipa-ca.crt
    volumes:
      - ./ipa-ca.crt:/etc/otisak/ipa-ca.crt:ro
```

### ELPIS ID

Jedinstvena prijava preko ELPIS ID servisa (OAuth 2.0 / OIDC). Prijava radi samo za ELPIS ID naloge koji su već povezani sa OTISAK nalogom. Uključuje se kroz skriptu:

```bash
./deploy.sh --elpis-id \
  --elpis-issuer https://auth.example.org \
  --elpis-client-id elpis_otisak_xxxxxx \
  --elpis-client-secret eid_xxxxxxxxxxxxxxxx
```

## Rezervne kopije

```bash
# izvoz baze
docker compose exec -T db pg_dump -U otisak otisak > otisak-$(date +%F).sql

# vraćanje u praznu bazu
docker compose exec -T db psql -U otisak -d otisak < otisak-2026-01-31.sql
```

Slike koje se dodaju u pitanja čuvaju se u bazi, pa su obuhvaćene istom kopijom.

## Opasne komande

Sledeće komande **trajno brišu podatke**. Pre njih napravite rezervnu kopiju.

| Komanda | Šta radi |
|---|---|
| `./deploy.sh --clean` | Briše bazu i slike kontejnera i sve gradi ispočetka. Kreira se novi administrator sa novom lozinkom. |
| `./deploy.sh --seed` | Briše sve korisnike osim administratora (zajedno sa njihovim polaganjima) i učitava demo korisnike sa lozinkom `changeme`. |
| `docker compose down -v` | Zaustavlja sistem i briše bazu. |

`docker compose down` bez `-v` zaustavlja sistem i čuva podatke.

## Rešavanje problema

| Problem | Šta proveriti |
|---|---|
| Aplikacija se ne pokreće | `docker compose logs app --tail 50`. Najčešći uzrok je `SESSION_SECRET` koji nedostaje ili je prekratak. |
| Praćenje ispita uživo ne radi iza proxy-ja | Proxy ne prosleđuje WebSocket (`Upgrade` / `Connection` zaglavlja za `/ws`). |
| Izgubljena lozinka administratora | `./deploy.sh --set-admin-password` |
| LDAP prijava ne radi | Da li kontejner vidi `LDAP_*` promenljive (`docker compose exec app env \| grep LDAP`) i da li je `LDAP_URL` naziv hosta koji odgovara sertifikatu. |
