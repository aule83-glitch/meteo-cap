"""
Dystrybucja CAP XML przez FTP i email.
Wszystkie biblioteki ze standardowej biblioteki Python — brak dodatkowych zależności.

Konfiguracja w /data/delivery_config.json (edytowalna przez UI lub ręcznie).
"""

import ftplib
import smtplib
import ssl
import os
import json
import threading
import time
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime, timezone
from typing import List, Optional

logger = logging.getLogger(__name__)

CONFIG_FILE = "/data/delivery_config.json"

DEFAULT_CONFIG = {
    "ftp": [],      # lista serwerów FTP
    "email": {
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "smtp_use_tls": True,
        "from_address": "ostrzezenia@imgw.pl",
        "from_name": "IMGW-PIB Ostrzeżenia Meteorologiczne",
        "recipients": [],   # lista {"address": "...", "name": "...", "min_level": 1}
    }
}


def load_config() -> dict:
    if not os.path.exists(CONFIG_FILE):
        return DEFAULT_CONFIG.copy()
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
        # Uzupełnij brakujące klucze z domyślnych
        for k, v in DEFAULT_CONFIG.items():
            if k not in cfg:
                cfg[k] = v
        return cfg
    except Exception:
        return DEFAULT_CONFIG.copy()


def save_config(config: dict) -> None:
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


# ============================================================
# FTP
# ============================================================

def send_ftp(
    ftp_config: dict,
    cap_xml: str,
    filename: str,
) -> dict:
    """
    Wysyła plik CAP XML na serwer FTP.

    ftp_config pola:
        host, port (domyślnie 21), user, password,
        remote_dir (katalog docelowy, np. /pub/cap/),
        use_passive (domyślnie True),
        use_tls (domyślnie False),
        name (opis serwera)
    """
    host     = ftp_config.get("host", "")
    port     = int(ftp_config.get("port", 21))
    user     = ftp_config.get("user", "anonymous")
    password = ftp_config.get("password", "")
    remote_dir = ftp_config.get("remote_dir", "/")
    use_passive = ftp_config.get("use_passive", True)
    use_tls  = ftp_config.get("use_tls", False)

    if not host:
        return {"success": False, "error": "Brak hosta FTP"}

    try:
        if use_tls:
            ftp = ftplib.FTP_TLS(timeout=30)
            ftp.connect(host, port)
            ftp.login(user, password)
            ftp.prot_p()  # włącz szyfrowanie danych
        else:
            ftp = ftplib.FTP(timeout=30)
            ftp.connect(host, port)
            ftp.login(user, password)

        if use_passive:
            ftp.set_pasv(True)

        # Przejdź do katalogu docelowego
        if remote_dir and remote_dir != "/":
            try:
                ftp.cwd(remote_dir)
            except ftplib.error_perm:
                # Spróbuj utworzyć katalog
                ftp.mkd(remote_dir)
                ftp.cwd(remote_dir)

        # Wyślij plik
        import io
        data = cap_xml.encode("utf-8")
        ftp.storbinary(f"STOR {filename}", io.BytesIO(data))
        ftp.quit()

        logger.info(f"FTP {host}: wysłano {filename} do {remote_dir}")
        return {"success": True, "error": None, "server": host, "file": filename}

    except ftplib.all_errors as e:
        logger.error(f"FTP {host}: błąd — {e}")
        return {"success": False, "error": str(e), "server": host}
    except Exception as e:
        return {"success": False, "error": str(e), "server": host}


# ============================================================
# EMAIL
# ============================================================

def send_email(
    email_config: dict,
    cap_xml: str,
    filename: str,
    warning: dict,
    recipients: list,
) -> dict:
    """
    Wysyła email z plikiem CAP XML jako załącznik.
    recipients: lista {"address": "...", "name": "..."} lub lista stringów
    """
    smtp_host = email_config.get("smtp_host", "")
    if not smtp_host:
        return {"success": False, "error": "Brak hosta SMTP"}

    smtp_port = int(email_config.get("smtp_port", 587))
    smtp_user = email_config.get("smtp_user", "")
    smtp_pass = email_config.get("smtp_password", "")
    use_tls   = email_config.get("smtp_use_tls", True)
    from_addr = email_config.get("from_address", "ostrzezenia@imgw.pl")
    from_name = email_config.get("from_name", "IMGW-PIB")

    if not recipients:
        return {"success": False, "error": "Brak odbiorców"}

    # Buduj temat i treść
    from app.data.warning_texts import WARNING_CONFIG, COLOR_PL
    from app.services.warning_levels import PHENOMENON_LABELS

    phenomenon = warning.get("phenomenon", "")
    level      = warning.get("level", 1)
    ph_label   = PHENOMENON_LABELS.get(phenomenon, phenomenon)
    color      = COLOR_PL.get(level, "Żółty")
    now_str    = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")

    subject = f"[IMGW-PIB] {color} ostrzeżenie meteorologiczne {level}° — {ph_label} — {now_str}"

    # Opis zasięgu
    counties = warning.get("counties", [])
    voiv_groups: dict = {}
    for c in counties:
        vn = c.get("voiv_name", "")
        voiv_groups.setdefault(vn, []).append(c.get("name", ""))
    if len(voiv_groups) >= 14:
        area_text = "Cała Polska"
    elif len(voiv_groups) == 1:
        vn, names = list(voiv_groups.items())[0]
        area_text = f"woj. {vn}: {', '.join(sorted(names))}"
    else:
        area_text = "; ".join(
            f"woj. {v}: {', '.join(sorted(ns)[:3])}{'...' if len(ns)>3 else ''}"
            for v, ns in sorted(voiv_groups.items())[:4]
        )
        if len(voiv_groups) > 4:
            area_text += f" (+{len(voiv_groups)-4} woj.)"

    # Czas
    try:
        onset_dt   = datetime.fromisoformat(warning.get("onset","").replace("Z","+00:00"))
        expires_dt = datetime.fromisoformat(warning.get("expires","").replace("Z","+00:00"))
        time_str = f"{onset_dt.strftime('%d.%m.%Y %H:%M')} – {expires_dt.strftime('%d.%m.%Y %H:%M')} UTC"
    except Exception:
        time_str = "—"

    body_plain = f"""IMGW-PIB — Ostrzeżenie meteorologiczne

Zjawisko:  {ph_label}
Stopień:   {level} ({color})
Zasięg:    {area_text}
Ważne:     {time_str}

{warning.get('description', '')}

{warning.get('instruction', '')}

---
Plik CAP 1.2 XML w załączniku.
Identyfikator: {warning.get('id', '')}
Wygenerowano: {now_str}

IMGW-PIB Centrum Modelowania Meteorologicznego
https://meteo.imgw.pl
"""

    body_html = f"""<html><body style="font-family:Arial,sans-serif;color:#1e3a5f">
<div style="border-left:4px solid {'#facc15' if level==1 else '#f97316' if level==2 else '#ef4444'};
     padding:12px 20px;margin-bottom:16px;background:#f8fafc">
  <h2 style="margin:0 0 8px">{color} ostrzeżenie meteorologiczne — stopień {level}</h2>
  <p style="margin:4px 0"><b>Zjawisko:</b> {ph_label}</p>
  <p style="margin:4px 0"><b>Zasięg:</b> {area_text}</p>
  <p style="margin:4px 0"><b>Ważne:</b> {time_str}</p>
</div>
<p>{warning.get('description','').replace(chr(10),'<br>')}</p>
<p><i>{warning.get('instruction','').replace(chr(10),'<br>')}</i></p>
<hr style="border:none;border-top:1px solid #e2e8f0">
<p style="font-size:11px;color:#64748b">
  Plik CAP 1.2 XML w załączniku.<br>
  ID: {warning.get('id','')}<br>
  IMGW-PIB Centrum Modelowania Meteorologicznego · {now_str}
</p>
</body></html>"""

    # Normalizuj odbiorców
    to_list = []
    for r in recipients:
        if isinstance(r, str):
            to_list.append(r)
        elif isinstance(r, dict):
            addr = r.get("address", "")
            name = r.get("name", "")
            to_list.append(f"{name} <{addr}>" if name else addr)

    errors = []
    sent   = []

    try:
        if use_tls:
            context = ssl.create_default_context()
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls(context=context)
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)

        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)

        for to_addr in to_list:
            try:
                msg = MIMEMultipart("mixed")
                msg["Subject"] = subject
                msg["From"]    = f"{from_name} <{from_addr}>"
                msg["To"]      = to_addr
                msg["X-IMGW-Warning-Level"] = str(level)
                msg["X-IMGW-Warning-ID"]    = warning.get("id", "")[:36]

                # Treść
                alt = MIMEMultipart("alternative")
                alt.attach(MIMEText(body_plain, "plain", "utf-8"))
                alt.attach(MIMEText(body_html,  "html",  "utf-8"))
                msg.attach(alt)

                # Załącznik XML
                part = MIMEBase("application", "xml")
                part.set_payload(cap_xml.encode("utf-8"))
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment",
                                filename=filename)
                msg.attach(part)

                server.sendmail(from_addr, to_addr, msg.as_string())
                sent.append(to_addr)
                logger.info(f"Email wysłany do {to_addr}: {filename}")
            except Exception as e:
                errors.append(f"{to_addr}: {e}")
                logger.error(f"Email do {to_addr}: błąd — {e}")

        server.quit()

    except Exception as e:
        return {"success": False, "error": str(e), "sent": [], "errors": [str(e)]}

    return {
        "success": len(errors) == 0,
        "sent":   sent,
        "errors": errors,
        "error":  "; ".join(errors) if errors else None,
    }


# ============================================================
# DISPATCH — FTP + EMAIL
# ============================================================

def dispatch_all_async(cap_xml: str, filename: str, warning: dict) -> None:
    """
    Wysyła CAP XML przez wszystkie skonfigurowane kanały (FTP + email) asynchronicznie.
    """
    config = load_config()
    level  = warning.get("level", 1)

    def _run():
        results = {"ftp": [], "email": None}

        # FTP — każdy serwer osobno
        for ftp_cfg in config.get("ftp", []):
            if not ftp_cfg.get("active", True):
                continue
            if ftp_cfg.get("min_level", 1) > level:
                continue
            result = send_ftp(ftp_cfg, cap_xml, filename)
            result["server_name"] = ftp_cfg.get("name", ftp_cfg.get("host", ""))
            results["ftp"].append(result)

        # Email — zbiorczy (filtruj odbiorców po min_level)
        email_cfg = config.get("email", {})
        if email_cfg.get("smtp_host"):
            all_recipients = email_cfg.get("recipients", [])
            filtered = [
                r for r in all_recipients
                if (
                    (r.get("min_level", 1) if isinstance(r, dict) else 1) <= level
                    and (r.get("active", True) if isinstance(r, dict) else True)
                )
            ]
            if filtered:
                results["email"] = send_email(
                    email_cfg, cap_xml, filename, warning, filtered
                )

        # Zapisz wyniki do logu
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "warning_id": warning.get("id", "")[:36],
            "filename": filename,
            "results": results,
        }
        _append_delivery_log(log_entry)

    t = threading.Thread(target=_run, daemon=True)
    t.start()


def _append_delivery_log(entry: dict) -> None:
    log_file = "/data/delivery_log.json"
    try:
        if os.path.exists(log_file):
            with open(log_file, encoding="utf-8") as f:
                log = json.load(f)
        else:
            log = []
        log.insert(0, entry)
        log = log[:200]   # max 200 wpisów
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def test_ftp_connection(ftp_config: dict) -> dict:
    """Test połączenia FTP (tylko login, bez wysyłania)."""
    host = ftp_config.get("host", "")
    if not host:
        return {"reachable": False, "error": "Brak hosta"}
    try:
        cls = ftplib.FTP_TLS if ftp_config.get("use_tls") else ftplib.FTP
        ftp = cls(timeout=10)
        ftp.connect(host, int(ftp_config.get("port", 21)))
        ftp.login(ftp_config.get("user","anonymous"), ftp_config.get("password",""))
        welcome = ftp.getwelcome()
        ftp.quit()
        return {"reachable": True, "welcome": welcome}
    except Exception as e:
        return {"reachable": False, "error": str(e)}


def test_smtp_connection(email_config: dict) -> dict:
    """Test połączenia SMTP."""
    host = email_config.get("smtp_host", "")
    if not host:
        return {"reachable": False, "error": "Brak hosta SMTP"}
    try:
        port = int(email_config.get("smtp_port", 587))
        use_tls = email_config.get("smtp_use_tls", True)
        if use_tls:
            server = smtplib.SMTP(host, port, timeout=10)
            server.ehlo()
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        if email_config.get("smtp_user"):
            server.login(email_config["smtp_user"], email_config.get("smtp_password",""))
        server.quit()
        return {"reachable": True}
    except Exception as e:
        return {"reachable": False, "error": str(e)}
