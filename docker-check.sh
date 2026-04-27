#!/usr/bin/env bash
# MeteoCAP — skrypt diagnostyczny i reset Dockera
# Uruchom: bash docker-check.sh

set -euo pipefail
RED='\033[0;31m'; YEL='\033[0;33m'; GRN='\033[0;32m'; NC='\033[0m'

echo ""
echo "========================================"
echo " MeteoCAP — Diagnostyka Docker"
echo "========================================"
echo ""

# 1. Wersje
echo "[ 1/6 ] Wersje:"
docker --version && docker compose version || { echo -e "${RED}BŁĄD: Docker nie jest zainstalowany lub nie działa${NC}"; exit 1; }

# 2. Daemon
echo ""
echo "[ 2/6 ] Status daemona:"
if docker info > /dev/null 2>&1; then
  echo -e "${GRN}✓ Docker daemon działa${NC}"
else
  echo -e "${RED}✗ Docker daemon NIE odpowiada${NC}"
  echo "  → Windows: uruchom Docker Desktop"
  echo "  → Linux:   sudo systemctl start docker"
  exit 1
fi

# 3. Port 3000
echo ""
echo "[ 3/6 ] Port 3000:"
if lsof -i :3000 > /dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":3000 "; then
  echo -e "${YEL}⚠ Port 3000 zajęty — aplikacja może nie wystartować${NC}"
  echo "  → Zmień port w docker-compose.yml na np. 3001:80"
else
  echo -e "${GRN}✓ Port 3000 wolny${NC}"
fi

# 4. Pliki projektu
echo ""
echo "[ 4/6 ] Pliki projektu:"
for f in docker-compose.yml backend/Dockerfile frontend/Dockerfile frontend/package.json backend/requirements.txt; do
  if [ -f "$f" ]; then
    echo -e "  ${GRN}✓${NC} $f"
  else
    echo -e "  ${RED}✗${NC} $f — BRAK"
  fi
done

# 5. Miejsce na dysku
echo ""
echo "[ 5/6 ] Miejsce na dysku:"
FREE=$(df -BG . | awk 'NR==2 {print $4}' | tr -d 'G')
if [ "${FREE:-0}" -lt 5 ] 2>/dev/null; then
  echo -e "${YEL}⚠ Mało miejsca: ${FREE}GB — Docker potrzebuje min. 5GB${NC}"
else
  echo -e "${GRN}✓ Dostępne: ${FREE}GB${NC}"
fi

# 6. Poprzednie kontenery
echo ""
echo "[ 6/6 ] Istniejące kontenery MeteoCAP:"
RUNNING=$(docker ps -a --filter "name=meteocap" --format "{{.Names}} {{.Status}}" 2>/dev/null)
if [ -n "$RUNNING" ]; then
  echo "$RUNNING"
  echo ""
  echo -e "${YEL}Aby wyczyścić stare kontenery:${NC}"
  echo "  docker compose down --volumes --remove-orphans"
else
  echo -e "${GRN}✓ Brak starych kontenerów${NC}"
fi

echo ""
echo "========================================"
echo " Diagnostyka zakończona"
echo "========================================"
echo ""
echo "Aby uruchomić aplikację od zera:"
echo ""
echo "  docker compose down --volumes --remove-orphans"
echo "  docker compose build --no-cache"
echo "  docker compose up -d"
echo ""
echo "Logi backendu:  docker compose logs -f backend"
echo "Logi frontendu: docker compose logs -f frontend"
echo "Aplikacja:      http://localhost:3000"
echo ""

# Opcjonalny reset
read -p "Czy wykonać pełny reset i uruchomić aplikację teraz? [t/N] " ans
if [[ "$ans" =~ ^[tTyY]$ ]]; then
  echo ""
  echo "Zatrzymywanie starych kontenerów..."
  docker compose down --volumes --remove-orphans 2>/dev/null || true

  echo "Budowanie od zera (może potrwać 3-5 min)..."
  docker compose build --no-cache

  echo "Uruchamianie..."
  docker compose up -d

  echo ""
  echo -e "${GRN}Uruchomiono. Poczekaj 10 sekund i otwórz: http://localhost:3000${NC}"
  sleep 10

  echo ""
  echo "Status kontenerów:"
  docker compose ps
fi
