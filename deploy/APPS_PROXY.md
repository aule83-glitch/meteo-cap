# apps-proxy — jedna brama dla aplikacji na `container.imgw.ad`

## Skąd brał się bałagan

Mieszały się dwa modele dostępu:
1. **bezpośrednio po porcie** (Portainer pokazuje `0.0.0.0:31001`),
2. **przez proxy pod ścieżką** (`apps.container.imgw.ad/osmet-dev/`).

Przy prefiksie ścieżki aplikacja SPA musi wiedzieć, że nie żyje w katalogu głównym —
inaczej ładuje zasoby z `/assets/...` i wychodzi biała strona.

## Jak jest teraz

Aplikacja **sama obsługuje swój prefiks** `/osmet-dev/`, a proxy **niczego nie obcina**
(brak ukośnika na końcu `proxy_pass`). Efekt: jeden i ten sam adres działa w obu trybach:

| Sposób | Adres |
|---|---|
| Przez bramę | `http://apps.container.imgw.ad/osmet-dev/` |
| Bezpośrednio | `http://container.imgw.ad:31001/osmet-dev/` |

Wejście na `http://container.imgw.ad:31001/` przekierowuje na `/osmet-dev/`.

## Porty

| Kontener | Port | Rola |
|---|---|---|
| `apps-proxy` | **31000** | brama — to on stoi za `apps.container.imgw.ad` |
| `meteocap-frontend` | **31001** | IMGW-OSMET |
| `casexp` | **31002** | Case Explorer |

## Kolejność uruchamiania

Proxy podłącza się do **istniejących** sieci aplikacji, więc najpierw aplikacje:

```bash
cd ~/meteo-cap    && docker compose up -d --build
cd ~/case-explorer && docker compose up -d --build   # gdy będzie gotowy
cd ~/apps-proxy   && docker compose up -d
```

Sprawdzenie:
```bash
curl -s http://localhost:31000/                       # spis aplikacji
curl -sI http://localhost:31000/osmet-dev/ | head -1  # 200 OK
curl -s  http://localhost:31000/osmet-dev/api/version
```

## Dodanie kolejnej aplikacji

1. W jej `docker-compose.yml` nadaj sieci jawną nazwę (np. `name: radvol-network`).
2. W `apps-proxy/docker-compose.yml` dopisz tę sieć jako `external: true`.
3. W `apps-proxy/nginx.conf` dodaj blok `location /radvol/` z `proxy_pass http://<kontener>:80;`
   (**bez** ukośnika na końcu).
4. Zadbaj, by aplikacja obsługiwała swój prefiks (dla Vite: `base: '/radvol/'`).
5. `cd ~/apps-proxy && docker compose restart`

## Uwaga o sieciach

`external: true` odnosi się do **realnej** nazwy sieci w Dockerze (`docker network ls`),
a nie do aliasu z pliku aplikacji. Dlatego w proxy jest `name: meteocap-network`.
