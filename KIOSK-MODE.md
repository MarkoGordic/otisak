# Otisak Kiosk Mode -- Bezbedno okruzenje za ispite

Ovaj dokument opisuje dva pristupa za pokretanje Otisak-a u bezbednom kiosk rezimu na Linux racunarima na fakultetu, tako da studenti ne mogu da napuste aplikaciju tokom ispita.

---

## Sadrzaj

- [Plan 1: Browser-Level Lockdown (testiranje)](#plan-1-browser-level-lockdown-testiranje)
- [Plan 2: OS-Level Linux Kiosk (produkcija)](#plan-2-os-level-linux-kiosk-produkcija)
- [Poredjenje pristupa](#poredjenje-pristupa)
- [Security Checklist](#security-checklist)

---

## Plan 1: Browser-Level Lockdown (testiranje)

Brzo resenje za probno testiranje dok se OS-level ne pripremi. Pruza srednji nivo bezbednosti -- loguje sumnjive aktivnosti ali ne moze spreciti sve pokusaje izlaska.

### 1.1 Chromium Launch Script

Kreiraj `start-exam.sh`:

```bash
#!/bin/bash

# Kill existing instances
pkill -f chromium || true

# Disable screen saver
xset s off
xset -dpms
xset s noreplace

# Launch chromium in kiosk
chromium-browser \
  --kiosk \
  --no-first-run \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-suggestions-service \
  --disable-save-password-bubble \
  --disable-session-crashed-bubble \
  --disable-extensions \
  --disable-component-extensions-with-background-pages \
  --disable-features=TranslateUI \
  --disable-dev-tools \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --incognito \
  --app="https://otisak.fakultet.rs/exam" &

BROWSER_PID=$!

# Watchdog - restart browser if closed
while true; do
  if ! kill -0 $BROWSER_PID 2>/dev/null; then
    chromium-browser --kiosk --incognito \
      --app="https://otisak.fakultet.rs/exam" &
    BROWSER_PID=$!
  fi
  sleep 2
done
```

### 1.2 JavaScript lockdown (client-side)

Dodaj u exam page komponentu:

```typescript
// Blokiraj shortcute
document.addEventListener('keydown', (e) => {
  const blocked = [
    e.key === 'F11',
    e.key === 'F12',
    e.ctrlKey && e.shiftKey && e.key === 'I',
    e.ctrlKey && e.key === 'l',
    e.ctrlKey && e.key === 't',
    e.ctrlKey && e.key === 'n',
    e.ctrlKey && e.key === 'w',
    e.altKey && e.key === 'F4',
  ];
  if (blocked.some(Boolean)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// Blokiraj right-click
document.addEventListener('contextmenu', e => e.preventDefault());

// Detektuj tab switch / focus loss
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    fetch('/api/exam/log-event', {
      method: 'POST',
      body: JSON.stringify({ type: 'TAB_SWITCH', timestamp: Date.now() })
    });
  }
});

// Blokiraj copy/paste
document.addEventListener('copy', e => e.preventDefault());
document.addEventListener('paste', e => e.preventDefault());
document.addEventListener('cut', e => e.preventDefault());

// Detektuj pokusaj napustanja stranice
window.addEventListener('beforeunload', (e) => {
  e.preventDefault();
  e.returnValue = '';
});
```

### 1.3 Server-side verifikacija

Next.js middleware koji proverava da request dolazi sa fakultetske mreze:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/exam/take/')) {
    const ip = request.headers.get('x-forwarded-for') || request.ip;
    if (!isAllowedLabIP(ip)) {
      return NextResponse.redirect(new URL('/exam/not-allowed', request.url));
    }
  }
}
```

### 1.4 Ogranicenja browser-level pristupa

| Napad | Blokiran? | Komentar |
|-------|-----------|----------|
| Alt+Tab | NE | Student moze prebaciti na drugi prozor |
| Ctrl+Alt+F1-F6 | NE | Moze otvoriti TTY terminal |
| Super key | NE | Moze otvoriti app launcher |
| Kill proces | NE | Ako zna PID |
| F12 / DevTools | DA | Chromium flag blokira |
| Ctrl+T / Ctrl+N | DA | JS handler blokira |
| Right-click | DA | JS handler blokira |
| Copy/Paste | DA | JS handler blokira |
| Tab switch detekcija | DA | Loguje se na server |

**Zakljucak:** Browser-level je OK za testiranje i "honest student" scenario. Loguje sumnjive aktivnosti ali nije otporan na studenta koji aktivno pokusava da vara.

---

## Plan 2: OS-Level Linux Kiosk (produkcija)

Najbezbednije resenje za Linux. Zahteva samo konfiguraciju, bez custom softvera.

### Arhitektura

```
+--------------------------------------------------+
|  Linux Lab Machine                                |
|                                                   |
|  Auto-login -> restricted "exam" user             |
|  Custom session -> Openbox (minimalni WM)         |
|  Launches -> Chromium --kiosk https://otisak/...  |
|                                                   |
|  Blokirano:                                       |
|  x TTY switching (Ctrl+Alt+F1-F6)                 |
|  x Alt+Tab, Alt+F4, Super key                     |
|  x Right-click, context menus                     |
|  x Terminal pristup                               |
|  x File manager, drugi programi                   |
|  x USB storage mounting                           |
|  x Mrezne promene                                 |
|                                                   |
|  OverlayFS -> reboot resetuje sve promene         |
+--------------------------------------------------+
```

### Faza 1 -- Priprema sistema

IT admin radi ovo jednom po racunaru (ili jednom za PXE image).

#### 1.1 Kreiranje exam korisnika

```bash
# Kreiraj korisnika bez shell pristupa
sudo useradd -m -s /bin/false exam-user
sudo passwd -l exam-user  # disable password login (auto-login only)

# Minimalne dozvole
sudo chmod 700 /home/exam-user
```

#### 1.2 Instalacija minimalnog WM

```bash
# Instaliraj samo ono sto je potrebno
sudo apt install openbox xorg chromium-browser xdotool

# NE instaliraj terminal, file manager, text editor
# Ukloni ako postoje:
sudo apt remove --purge gnome-terminal xterm konsole thunar nautilus
```

#### 1.3 Openbox konfiguracija (prazni keybindingovi)

Kreiraj `/home/exam-user/.config/openbox/rc.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <resistance>
    <strength>10</strength>
    <screen_edge_strength>20</screen_edge_strength>
  </resistance>

  <!-- PRAZNA TASTATURA - nijedan shortcut ne radi -->
  <keyboard>
    <chainQuitKey>C-g</chainQuitKey>
    <!-- Nema Alt+Tab, nema Alt+F4, nema Super, nista -->
  </keyboard>

  <!-- PRAZAN MIS - nema desktop meni -->
  <mouse>
    <context name="Root">
      <mousebind button="Left" action="Press"></mousebind>
    </context>
    <context name="Desktop">
      <mousebind button="Right" action="Press"></mousebind>
    </context>
  </mouse>

  <applications>
    <!-- Chromium uvek fullscreen, bez dekoracije -->
    <application class="*">
      <fullscreen>yes</fullscreen>
      <decor>no</decor>
      <maximized>true</maximized>
    </application>
  </applications>
</openbox_config>
```

#### 1.4 Blokiraj TTY switch

Kreiraj `/etc/X11/xorg.conf.d/10-kiosk-security.conf`:

```
Section "ServerFlags"
    Option "DontVTSwitch" "true"
    Option "DontZap"      "true"
EndSection
```

#### 1.5 Auto-login i Custom Session

Kreiraj session fajl `/usr/share/xsessions/exam-kiosk.desktop`:

```ini
[Desktop Entry]
Name=Exam Kiosk
Comment=Locked exam environment
Exec=/usr/local/bin/exam-kiosk-session.sh
Type=Application
```

Kreiraj `/usr/local/bin/exam-kiosk-session.sh`:

```bash
#!/bin/bash

# Pokreni Openbox
openbox --config-file /home/exam-user/.config/openbox/rc.xml &
sleep 1

# Disable screen blanking
xset s off
xset -dpms

# Pokreni watchdog kao background servis
/usr/local/bin/exam-watchdog.sh &

# Pokreni Chromium kiosk
exec chromium-browser \
  --kiosk \
  --no-first-run \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-extensions \
  --disable-dev-tools \
  --disable-pinch \
  --incognito \
  --app="https://otisak.fakultet.rs"
```

```bash
sudo chmod +x /usr/local/bin/exam-kiosk-session.sh
```

Konfigurisanje auto-login-a u LightDM:

```ini
# /etc/lightdm/lightdm.conf
[Seat:*]
autologin-user=exam-user
autologin-session=exam-kiosk
user-session=exam-kiosk
greeter-hide-users=true
```

### Faza 2 -- Watchdog i Process Control

#### 2.1 Watchdog skripta

Kreiraj `/usr/local/bin/exam-watchdog.sh`:

```bash
#!/bin/bash

ALLOWED_PROCS="chromium|openbox|Xorg|dbus|pulseaudio|exam-watchdog"

while true; do
  # Restartuj browser ako je crknuo
  if ! pgrep -f "chromium.*kiosk" > /dev/null; then
    chromium-browser --kiosk --incognito \
      --disable-extensions --disable-dev-tools \
      --app="https://otisak.fakultet.rs" &
  fi

  # Ubij sve neovlascene procese exam-user-a
  for pid in $(ps -u exam-user -o pid= -o comm= \
    | grep -vE "$ALLOWED_PROCS" | awk '{print $1}'); do
    kill -9 "$pid" 2>/dev/null
  done

  # Vrati fokus na Chromium ako ga izgubi
  CHROME_WID=$(xdotool search --class chromium | head -1)
  ACTIVE_WID=$(xdotool getactivewindow 2>/dev/null)
  if [ "$CHROME_WID" != "$ACTIVE_WID" ] && [ -n "$CHROME_WID" ]; then
    xdotool windowactivate "$CHROME_WID"
  fi

  sleep 2
done
```

```bash
sudo chmod +x /usr/local/bin/exam-watchdog.sh
```

#### 2.2 Systemd service za watchdog

Kreiraj `/etc/systemd/system/exam-watchdog.service`:

```ini
[Unit]
Description=Exam Kiosk Watchdog
After=display-manager.service

[Service]
Type=simple
User=exam-user
Environment=DISPLAY=:0
ExecStart=/usr/local/bin/exam-watchdog.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable exam-watchdog.service
```

### Faza 3 -- Hardening

#### 3.1 USB Storage blokiranje

```bash
# /etc/udev/rules.d/99-block-usb-storage.rules
ACTION=="add", SUBSYSTEMS=="usb", DRIVERS=="usb-storage", \
  RUN+="/bin/sh -c 'echo 0 > /sys$DEVPATH/authorized'"

# Ili potpuno blacklist-uj modul:
echo "blacklist usb-storage" | sudo tee /etc/modprobe.d/block-usb.conf
```

#### 3.2 Firewall -- samo Otisak server

```bash
# Dozvoli SAMO pristup Otisak serveru
sudo iptables -P OUTPUT DROP
sudo iptables -A OUTPUT -d <OTISAK_SERVER_IP> -p tcp --dport 443 -j ACCEPT
sudo iptables -A OUTPUT -d <DNS_SERVER_IP> -p udp --dport 53 -j ACCEPT
sudo iptables -A OUTPUT -o lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Sacuvaj pravila
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

#### 3.3 OverlayFS (reboot = reset)

```bash
# Instaliraj overlayroot
sudo apt install overlayroot

# /etc/overlayroot.conf
overlayroot="tmpfs:swap=1,recurse=0"

# Nakon reboot-a, sve promene koje je student napravio nestaju
```

#### 3.4 BIOS/UEFI zakljucavanje

- Postavi BIOS password
- Boot order: samo interni disk (ne USB, ne network)
- Disable boot menu shortcut (F12/F2)

### Faza 4 -- Deployment strategija

#### Opcija A: PXE Network Boot (preporuka za lab)

```
                    +---------------+
                    |  PXE Server   |
                    |  (TFTP+DHCP)  |
                    |               |
                    |  exam.img     |
                    +-------+-------+
                            | Network Boot
              +-------------+-------------+
              |             |             |
         +----+----+  +----+----+  +----+----+
         |  PC 1   |  |  PC 2   |  |  PC N   |
         | (kiosk) |  | (kiosk) |  | (kiosk) |
         +---------+  +---------+  +---------+
```

**Prednosti:**
- Jedan image, svi racunari boot-uju isti
- Promena konfiguracije = update image na serveru
- Racunari ne trebaju hard disk uopste
- IT moze switch-ovati izmedju "normal" i "exam" boot-a

#### Opcija B: Dual Session (manje invazivno)

- Zadrzi postojeci Linux sa svim desktop session-ima
- Dodaj "Exam Kiosk" session u LightDM
- Profesor/IT bira session pri login-u
- Manje bezbedno (student moze reboot-ovati u normalan session)
- Resenje: BIOS password + auto-login u exam session tokom ispita

---

## Poredjenje pristupa

| Kriterijum | Browser-Level | OS-Level |
|---|---|---|
| **Vreme za setup** | 1-2 sata | 2-3 dana (jednom) |
| **Bezbednost** | Niska-srednja | Vrlo visoka |
| **Za sta koristiti** | Testiranje, razvoj, demo | Produkcija, pravi ispiti |
| **Ko treba da uradi** | Developer | Developer + IT admin |
| **Potreban HW pristup** | Ne | Da (BIOS, PXE server) |
| **Alt+Tab blokiran** | Ne | Da |
| **TTY switch blokiran** | Ne | Da |
| **USB blokiran** | Ne | Da |
| **Mrezni pristup ogranicen** | Ne | Da |
| **Otporan na reboot** | Ne | Da (OverlayFS) |

---

## Security Checklist

Pre pustanja u produkciju, proveri sledece:

```
[ ] Alt+Tab ne radi
[ ] Alt+F4 ne radi, browser se restartuje
[ ] Ctrl+Alt+F1-F6 ne radi (TTY switch)
[ ] Ctrl+Alt+Del ne radi ili je interceptovan
[ ] Super/Windows key ne radi
[ ] Right-click ne radi (i u WM i u browseru)
[ ] F12 / Ctrl+Shift+I ne otvara DevTools
[ ] Ctrl+L ne otvara address bar
[ ] Ctrl+T / Ctrl+N ne otvara novi tab/prozor
[ ] USB flash drive se ne mount-uje
[ ] Pristup drugim sajtovima je blokiran (firewall)
[ ] Zatvaranje browsera -> automatski restart
[ ] Pokretanje terminala nije moguce
[ ] Reboot vraca u isto stanje (OverlayFS)
[ ] Otisak activity tracking loguje focus/blur eventi
[ ] BIOS password je postavljen
[ ] Boot order je zakljucan (samo interni disk)
```

---

## Preporuka

1. **Pocni sa browser-level** odmah za testiranje i razvoj
2. Paralelno sa IT timom fakulteta pripremi **OS-level kiosk image**
3. Kombinuj oba -- OS-level sprecava izlazak, a JS lockdown loguje sumnjive aktivnosti kao dodatni sloj
