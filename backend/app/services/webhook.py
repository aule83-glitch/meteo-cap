"""
Webhook push — wysyłanie CAP XML na skonfigurowane URL po zapisaniu ostrzeżenia.
Obsługuje retry (3 próby) i logi błędów. Działa asynchronicznie w tle.
"""

import urllib.request
import urllib.error
import threading
import time
import json
import os
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

WEBHOOKS_FILE = "/data/webhooks.json"


def load_webhooks() -> List[dict]:
    """Wczytaj listę webhooków z pliku."""
    if not os.path.exists(WEBHOOKS_FILE):
        return []
    try:
        with open(WEBHOOKS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_webhooks(webhooks: List[dict]) -> None:
    """Zapisz listę webhooków do pliku."""
    os.makedirs(os.path.dirname(WEBHOOKS_FILE), exist_ok=True)
    with open(WEBHOOKS_FILE, "w", encoding="utf-8") as f:
        json.dump(webhooks, f, ensure_ascii=False, indent=2)


def _send_one(url: str, cap_xml: str, warning_id: str, headers: dict = None) -> dict:
    """
    Wyślij CAP XML na jeden URL. Zwraca {success, status_code, error}.
    """
    data = cap_xml.encode("utf-8")
    req_headers = {
        "Content-Type": "application/xml; charset=utf-8",
        "User-Agent": "MeteoCAP-Editor/1.0 (IMGW-PIB)",
        "X-Warning-ID": warning_id,
        "X-Source": "IMGW-PIB MeteoCAP",
    }
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return {"success": True, "status_code": resp.status, "error": None}
    except urllib.error.HTTPError as e:
        return {"success": False, "status_code": e.code, "error": str(e)}
    except urllib.error.URLError as e:
        return {"success": False, "status_code": None, "error": str(e.reason)}
    except Exception as e:
        return {"success": False, "status_code": None, "error": str(e)}


def _send_with_retry(webhook: dict, cap_xml: str, warning_id: str,
                     max_retries: int = 3, delay: float = 2.0) -> dict:
    """Wyślij z retry. Zwraca ostatni wynik."""
    url = webhook.get("url", "")
    headers = webhook.get("headers", {})
    result = None
    for attempt in range(max_retries):
        result = _send_one(url, cap_xml, warning_id, headers)
        if result["success"]:
            logger.info(f"Webhook {url}: sukces (próba {attempt+1})")
            return result
        logger.warning(f"Webhook {url}: błąd {result['error']} (próba {attempt+1}/{max_retries})")
        if attempt < max_retries - 1:
            time.sleep(delay * (attempt + 1))
    return result


def dispatch_webhooks_async(cap_xml: str, warning_id: str,
                            warning_level: int = None) -> None:
    """
    Wysyła CAP XML do wszystkich aktywnych webhooków w tle (thread).
    Filtruje po min_level jeśli skonfigurowane.
    """
    webhooks = load_webhooks()
    active = [
        w for w in webhooks
        if w.get("active", True)
        and (w.get("min_level", 1) <= (warning_level or 1))
    ]

    if not active:
        return

    def _send_all():
        for wh in active:
            result = _send_with_retry(wh, cap_xml, warning_id)
            # Zapisz ostatni wynik do webhooka (do podglądu w UI)
            wh["last_result"] = result
            wh["last_sent"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save_webhooks(load_webhooks())  # Nie nadpisuj — może być race condition przy małej skali

    t = threading.Thread(target=_send_all, daemon=True)
    t.start()


def test_webhook(url: str, headers: dict = None) -> dict:
    """Test połączenia z webhookiem (GET request)."""
    req_headers = {"User-Agent": "MeteoCAP-Editor/1.0 (IMGW-PIB test)"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"reachable": True, "status_code": resp.status}
    except Exception as e:
        return {"reachable": False, "error": str(e)}
