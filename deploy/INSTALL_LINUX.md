# IMGW-OSMET — instalacja na Linuksie BEZ Dockera

Wariant: **Python (venv) + uvicorn pod systemd + nginx jako serwer statyków i proxy API.**
Wymaga uprawnień administratora (sudo). Docker nie jest potrzebny.

**sqlite3 nie jest potrzebny** — aplikacja nie używa bazy SQL. Dane trzyma w plikach JSON
w katalogu danych (atomowy zapis + kopia `.bak`). Jeśli w przyszłości pojawi się potrzeba
pracy wielu synoptyków jednocześnie, migracja na SQLite będzie sensownym krokiem — dziś nie jest wymagana.

---

## 0. Co gdzie ląduje

| Element | Ścieżka | Uwaga |
|---|---|---|
| Kod aplikacji | `/opt/osmet` | tu rozpakowujesz ZIP (jest `backend/`, `frontend/`, `VERSION`) |
| Środowisko Pythona | `/opt/osmet/venv` | tworzone w kroku 2 |
| Katalog roboczy usługi | `/opt/osmet/backend` | pakiet aplikacji to `app`, importy są `app.*` |
| **Dane** | `/var/lib/osmet` | baza ostrzeżeń, biblioteka skutków, konfiguracja dostawy — **nie dotykać przy aktualizacjach** |
| Frontend (zbudowany) | `/var/www/osmet` | zawartość `frontend/dist` |
| Usługa | `osmet-backend.service` | uvicorn na `127.0.0.1:8000` |

---

## 1. Pakiety systemowe

Debian / Ubuntu:
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx fonts-dejavu-core
```

RHEL / Rocky / Fedora:
```bash
sudo dnf install -y python3 python3-pip nginx dejavu-sans-fonts
```

`fonts-dejavu-core` / `dejavu-sans-fonts` jest **wymagany** — bez niego generator PDF nie
wystawi polskich znaków (aplikacja szuka `DejaVuSans.ttf` w standardowych lokalizacjach).

## 2. Kod i środowisko Pythona

```bash
sudo mkdir -p /opt/osmet /var/lib/osmet /var/www/osmet
sudo unzip imgw-osmet-v2.5.15.zip -d /tmp/osmet-pkg
sudo cp -r /tmp/osmet-pkg/osmet/. /opt/osmet/

cd /opt/osmet
sudo python3 -m venv venv
sudo ./venv/bin/pip install --upgrade pip
sudo ./venv/bin/pip install -r backend/requirements.txt
```

Konto usługi i uprawnienia (dane muszą być zapisywalne, kod nie musi):
```bash
sudo useradd --system --home /var/lib/osmet --shell /usr/sbin/nologin osmet || true
sudo chown -R osmet:osmet /var/lib/osmet
sudo chown -R root:root /opt/osmet
```

Szybki test, że backend wstaje (Ctrl+C przerywa):
```bash
cd /opt/osmet/backend      # WAŻNE: stąd, nie z /opt/osmet — pakiet nazywa się „app"
sudo OSMET_DATA_DIR=/var/lib/osmet ../venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# w drugim terminalu:
curl -s http://127.0.0.1:8000/api/version
# oczekiwane: {"version":"2.5.15","app":"IMGW-OSMET","data_dir":"/var/lib/osmet"}
```

## 3. Usługa systemd

```bash
sudo cp /opt/osmet/deploy/osmet-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now osmet-backend
systemctl status osmet-backend --no-pager
```

Logi: `journalctl -u osmet-backend -f`

## 4. Frontend

Frontend to aplikacja React/Vite — trzeba ją **raz zbudować** (potrzebny Node.js).
Node jest wymagany **tylko do budowania**, nie do działania.

**Wariant A — Node dostępny na serwerze:**
```bash
cd /opt/osmet/frontend
sudo npm ci        # albo: sudo npm install
sudo npm run build
sudo cp -r dist/. /var/www/osmet/
sudo chown -R www-data:www-data /var/www/osmet   # RHEL: nginx:nginx
```

**Wariant B — brak Node na serwerze (częste na maszynach produkcyjnych):**
zbuduj na swoim komputerze (`npm ci && npm run build` w katalogu `frontend`),
spakuj powstały katalog `dist` i skopiuj jego zawartość do `/var/www/osmet`.
Serwer nie potrzebuje wtedy Node ani npm.

> API i front są na tym samym adresie (nginx proxy `/api/`), więc **nie trzeba**
> ustawiać `VITE_API_URL` — domyślne `/api` jest poprawne.

## 5. nginx

```bash
# Debian/Ubuntu
sudo cp /opt/osmet/deploy/nginx-osmet.conf /etc/nginx/sites-available/osmet
sudo ln -sf /etc/nginx/sites-available/osmet /etc/nginx/sites-enabled/osmet
sudo rm -f /etc/nginx/sites-enabled/default        # jeśli koliduje o port 80

# RHEL/Rocky/Fedora
# sudo cp /opt/osmet/deploy/nginx-osmet.conf /etc/nginx/conf.d/osmet.conf

sudo nginx -t && sudo systemctl reload nginx
```

RHEL/Fedora dodatkowo — SELinux blokuje proxy z nginx i czytanie z `/var/www`:
```bash
sudo setsebool -P httpd_can_network_connect 1
sudo restorecon -Rv /var/www/osmet
```

Firewall (jeśli aktywny):
```bash
sudo ufw allow 80/tcp                       # Debian/Ubuntu
sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload   # RHEL
```

## 6. Weryfikacja

```bash
curl -s http://localhost/api/version      # wersja i katalog danych
curl -sI http://localhost/ | head -1      # 200 OK — front się serwuje
ls -l /var/lib/osmet                      # po pierwszym zapisie: warnings.json (+ .bak)
```

W przeglądarce: `http://<adres-serwera>/`. W nagłówku powinna być **v2.5.15** —
numer pochodzi z pliku `VERSION` przez `/api/version`, więc jest zawsze zgodny z wdrożonym kodem.

---

## Aktualizacja do nowej wersji

```bash
sudo systemctl stop osmet-backend
sudo cp -r /nowy-pakiet/osmet/backend /nowy-pakiet/osmet/VERSION /opt/osmet/
sudo ./venv/bin/pip install -r /opt/osmet/backend/requirements.txt   # gdy zmieniły się zależności
# frontend: przebuduj i podmień /var/www/osmet
sudo systemctl start osmet-backend
```

`/var/lib/osmet` zostaje nietknięty — dane i konfiguracja przeżywają aktualizację.

## Kopie zapasowe

Wystarczy archiwizować **katalog danych**:
```bash
sudo tar czf /backup/osmet-$(date +%F).tar.gz -C /var/lib osmet
```
Zawiera bazę ostrzeżeń, bibliotekę skutków, szablony, webhooki i konfigurację dostawy.
**Uwaga:** konfiguracja dostawy zawiera hasła FTP/SMTP w postaci jawnej — kopie trzymaj
z odpowiednimi uprawnieniami i nie wysyłaj ich do repozytorium.

## Diagnostyka

| Objaw | Przyczyna / działanie |
|---|---|
| `502 Bad Gateway` | backend nie działa → `systemctl status osmet-backend`, `journalctl -u osmet-backend -n 50` |
| Backend nie startuje, w logu „warnings.json uszkodzony… Odmowa startu" | **celowy bezpiecznik** — przywróć `sudo cp /var/lib/osmet/warnings.json.bak /var/lib/osmet/warnings.json` |
| PDF bez polskich znaków | brak pakietu DejaVu (krok 1) |
| Stara wersja w nagłówku po aktualizacji | cache `index.html` — konfiguracja nginx już to wyłącza; wymuś `Ctrl+Shift+R` |
| `403` na statykach (RHEL) | SELinux → `restorecon -Rv /var/www/osmet` |
| Zapis danych nie działa | właściciel `/var/lib/osmet` musi być `osmet` |

## Uwagi bezpieczeństwa

- Backend nasłuchuje na `127.0.0.1` — na świat wychodzi wyłącznie nginx. Nie zmieniaj na `0.0.0.0` bez potrzeby.
- Narzędzie nie ma logowania użytkowników. W sieci zakładowej rozważ `METEOCAP_API_KEY`
  w unicie systemd i/lub ograniczenie dostępu w nginx (`allow`/`deny`, HTTP Basic, VPN).
- Do wystawienia po HTTPS użyj certyfikatu zakładowego lub `certbot --nginx`.
