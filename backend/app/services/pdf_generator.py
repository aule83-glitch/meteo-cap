"""
Generator raportów PDF dla ostrzeżeń meteorologicznych IMGW-PIB.
Używa ReportLab. Gotowy do druku (A4).
"""

import io
import os
from datetime import datetime, timezone
from typing import List

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
    from reportlab.graphics import renderPDF
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# ── Rejestracja fontów z obsługą polskich znaków (DejaVu Sans) ───────────────
# DejaVu Sans jest dostępny w obrazie python:3.12-slim przez libfreetype6-dev
# lub instalowany przez apt. Fallback na Helvetica (bez polskich znaków).
_FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/dejavu",
    "/usr/share/fonts/TTF",
    "/usr/local/share/fonts",
    os.path.join(os.path.dirname(__file__), "..", "data", "fonts"),
]

def _find_font_file(filename: str) -> str | None:
    for d in _FONT_DIRS:
        path = os.path.join(d, filename)
        if os.path.isfile(path):
            return path
    return None

# Nazwy fontów używane w stylach — domyślnie Helvetica (fallback bez PL)
_FONT_REGULAR = "Helvetica"
_FONT_BOLD    = "Helvetica-Bold"

if REPORTLAB_AVAILABLE:
    _reg  = _find_font_file("DejaVuSans.ttf")
    _bold = _find_font_file("DejaVuSans-Bold.ttf")
    if _reg and _bold:
        try:
            pdfmetrics.registerFont(TTFont("DejaVuSans",      _reg))
            pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", _bold))
            _obl      = _find_font_file("DejaVuSans-Oblique.ttf")
            _boldObl  = _find_font_file("DejaVuSans-BoldOblique.ttf")
            if _obl:
                pdfmetrics.registerFont(TTFont("DejaVuSans-Oblique",     _obl))
            if _boldObl:
                pdfmetrics.registerFont(TTFont("DejaVuSans-BoldOblique", _boldObl))
            from reportlab.pdfbase.pdfmetrics import registerFontFamily
            registerFontFamily(
                "DejaVuSans",
                normal     = "DejaVuSans",
                bold       = "DejaVuSans-Bold",
                italic     = "DejaVuSans-Oblique"     if _obl     else "DejaVuSans",
                boldItalic = "DejaVuSans-BoldOblique" if _boldObl else "DejaVuSans-Bold",
            )
            _FONT_REGULAR = "DejaVuSans"
            _FONT_BOLD    = "DejaVuSans-Bold"
        except Exception:
            pass  # zostaje Helvetica

PHENOMENON_LABELS = {
    "burze": "Burze", "intensywne_opady_deszczu": "Intensywne opady deszczu",
    "intensywne_opady_sniegu": "Intensywne opady śniegu", "silny_wiatr": "Silny wiatr",
    "silny_mroz": "Silny mróz", "upal": "Upał", "opady_marzniece": "Opady marznące",
    "roztopy": "Roztopy", "silny_deszcz_z_burzami": "Silny deszcz z burzami",
    "zawieje_zamiecie": "Zawieje / zamiecie śnieżne", "mgla_szadz": "Mgła osadzająca szadź",
    "gesta_mgla": "Gęsta mgła", "oblodzenie": "Oblodzenie",
    "opady_sniegu": "Opady śniegu", "przymrozki": "Przymrozki",
}

LEVEL_COLORS_PDF = {
    1: colors.HexColor("#facc15"),
    2: colors.HexColor("#f97316"),
    3: colors.HexColor("#ef4444"),
}
LEVEL_BG_PDF = {
    1: colors.HexColor("#fefce8"),
    2: colors.HexColor("#fff7ed"),
    3: colors.HexColor("#fef2f2"),
}

STATUS_LABELS = {
    "active": "AKTYWNE", "pending": "NADCHODZĄCE",
    "expired": "WYGASŁE", "cancelled": "ANULOWANE",
    "updated": "ZAKTUALIZOWANE",
}


def _fmt_dt(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y %H:%M UTC")
    except Exception:
        return iso_str or "—"


def _area_summary(counties: list) -> tuple:
    """Zwraca (opis zasięgu, dict województwo→liczba_powiatów)."""
    if not counties:
        return "Brak danych", {}
    voiv_groups: dict = {}
    for c in counties:
        vn = c.get("voiv_name", "Nieznane")
        voiv_groups.setdefault(vn, []).append(c.get("name", ""))
    if len(voiv_groups) >= 14:
        desc = "Cała Polska"
    elif len(voiv_groups) == 1:
        vn, names = list(voiv_groups.items())[0]
        desc = f"Województwo {vn}"
    else:
        desc = f"{len(voiv_groups)} województw"
    return desc, voiv_groups


def generate_warning_pdf(
    warnings: list,
    title: str = "Raport ostrzeżeń meteorologicznych",
    voivodeship_filter: str = None,  # np. "Mazowieckie" aby filtrować
) -> bytes:
    """
    Generuje PDF z raportem ostrzeżeń.
    Zwraca bajty PDF lub None jeśli ReportLab niedostępny.
    """
    if not REPORTLAB_AVAILABLE:
        return None

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title=title,
        author="IMGW-PIB MeteoCAP Editor",
    )

    styles = getSampleStyleSheet()
    now_str = datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M UTC")

    # Style niestandardowe
    style_h1 = ParagraphStyle('h1', parent=styles['Heading1'],
        fontSize=16, textColor=colors.HexColor("#1e3a5f"),
        spaceAfter=4, fontName=_FONT_BOLD)
    style_h2 = ParagraphStyle('h2', parent=styles['Heading2'],
        fontSize=12, textColor=colors.HexColor("#1e3a5f"),
        spaceAfter=3, fontName=_FONT_BOLD)
    style_body = ParagraphStyle('body', parent=styles['Normal'],
        fontSize=9, leading=14, fontName=_FONT_REGULAR)
    style_small = ParagraphStyle('small', parent=styles['Normal'],
        fontSize=8, textColor=colors.HexColor("#64748b"), fontName=_FONT_REGULAR)
    style_center = ParagraphStyle('center', parent=styles['Normal'],
        fontSize=9, alignment=TA_CENTER, fontName=_FONT_REGULAR)
    style_footer = ParagraphStyle('footer', parent=styles['Normal'],
        fontSize=7, textColor=colors.HexColor("#94a3b8"),
        alignment=TA_CENTER, fontName=_FONT_REGULAR)

    story = []

    # === NAGŁÓWEK ===
    # Logo/header bar
    header_data = [[
        Paragraph('<b>IMGW-PIB</b>', ParagraphStyle('logo',
            fontSize=14, textColor=colors.white, fontName=_FONT_BOLD)),
        Paragraph(f'<b>{title}</b>', ParagraphStyle('title',
            fontSize=11, textColor=colors.white, fontName=_FONT_BOLD,
            alignment=TA_CENTER)),
        Paragraph(f'Stan na:<br/><b>{now_str}</b>', ParagraphStyle('date',
            fontSize=8, textColor=colors.white, fontName=_FONT_REGULAR,
            alignment=TA_RIGHT)),
    ]]
    header_table = Table(header_data, colWidths=[4*cm, 9*cm, 4*cm])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#1e3a5f")),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.white),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 8),
        ('ROUNDEDCORNERS', [4]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.4*cm))

    # Filtr województwa
    if voivodeship_filter:
        story.append(Paragraph(
            f'Zakres: <b>{voivodeship_filter}</b>',
            style_small
        ))
        story.append(Spacer(1, 0.2*cm))

    # Filtruj ostrzeżenia
    active_warnings = [w for w in warnings
                       if w.get("status") in ("active", "pending", "cancelled")]
    if voivodeship_filter:
        active_warnings = [
            w for w in active_warnings
            if any(c.get("voiv_name", "").lower() == voivodeship_filter.lower()
                   for c in w.get("counties", []))
        ]

    if not active_warnings:
        story.append(Spacer(1, 1*cm))
        story.append(Paragraph(
            "Brak aktywnych lub nadchodzących ostrzeżeń w wybranym zakresie.",
            style_center))
    else:
        story.append(Paragraph(
            f"Liczba ostrzeżeń: <b>{len(active_warnings)}</b> "
            f"(aktywne: {sum(1 for w in active_warnings if w.get('status')=='active')}, "
            f"nadchodzące: {sum(1 for w in active_warnings if w.get('status')=='pending')})",
            style_small))
        story.append(Spacer(1, 0.3*cm))

        # === TABELA PODSUMOWANIA ===
        story.append(Paragraph("Podsumowanie ostrzeżeń", style_h2))

        sum_data = [["Zjawisko", "Stopień", "Status", "Obowiązuje od", "Obowiązuje do", "Zasięg"]]
        for w in active_warnings:
            lvl = w.get("level", 1)
            ph = PHENOMENON_LABELS.get(w.get("phenomenon",""), w.get("phenomenon",""))
            area_desc, _ = _area_summary(w.get("counties", []))
            sum_data.append([
                Paragraph(ph, style_body),
                Paragraph(f"<b>{lvl}</b>", ParagraphStyle('lc', fontSize=11,
                    textColor=colors.black, fontName=_FONT_BOLD,
                    alignment=TA_CENTER)),
                Paragraph(STATUS_LABELS.get(w.get("status",""), "—"), style_body),
                Paragraph(_fmt_dt(w.get("onset","")), style_body),
                Paragraph(_fmt_dt(w.get("expires","")), style_body),
                Paragraph(area_desc, style_body),
            ])

        sum_table = Table(sum_data,
            colWidths=[4.5*cm, 1.5*cm, 2.5*cm, 3*cm, 3*cm, 2.5*cm],
            repeatRows=1)

        ts = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e3a5f")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), _FONT_BOLD),
            ('FONTSIZE', (0,0), (-1,0), 9),
            ('FONTSIZE', (0,1), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('PADDING', (0,0), (-1,-1), 5),
            ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ]
        # Kolorowanie wierszy wg stopnia
        for row_idx, w in enumerate(active_warnings, start=1):
            lvl = w.get("level", 1)
            bg = LEVEL_BG_PDF.get(lvl, colors.white)
            ts.append(('BACKGROUND', (0,row_idx), (-1,row_idx), bg))
            ts.append(('TEXTCOLOR', (1,row_idx), (1,row_idx),
                       LEVEL_COLORS_PDF.get(lvl, colors.black)))

        sum_table.setStyle(TableStyle(ts))
        story.append(sum_table)
        story.append(Spacer(1, 0.5*cm))

        # === SZCZEGÓŁY PER OSTRZEŻENIE ===
        story.append(HRFlowable(width="100%", thickness=1,
                                color=colors.HexColor("#e2e8f0")))
        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph("Szczegóły ostrzeżeń", style_h2))

        for w in active_warnings:
            lvl = w.get("level", 1)
            ph = PHENOMENON_LABELS.get(w.get("phenomenon",""), w.get("phenomenon",""))
            fill_color = LEVEL_COLORS_PDF.get(lvl, colors.yellow)
            bg_color = LEVEL_BG_PDF.get(lvl, colors.white)
            area_desc, voiv_groups = _area_summary(w.get("counties", []))

            block_elements = []

            # Nagłówek ostrzeżenia
            hdr_data = [[
                Paragraph(
                    f'<b>Stopień {lvl} — {ph}</b>',
                    ParagraphStyle('wh', fontSize=11, fontName=_FONT_BOLD,
                                   textColor=colors.HexColor("#1e3a5f"))),
                Paragraph(
                    f'<b>{STATUS_LABELS.get(w.get("status",""), "—")}</b>',
                    ParagraphStyle('ws', fontSize=9, fontName=_FONT_BOLD,
                                   textColor=colors.white, alignment=TA_RIGHT)),
            ]]
            hdr_table = Table(hdr_data, colWidths=[13*cm, 4*cm])
            hdr_bg = colors.HexColor("#fff3cd") if lvl==1 else \
                     colors.HexColor("#ffe0cc") if lvl==2 else \
                     colors.HexColor("#ffcccc")
            st_bg = fill_color
            hdr_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (0,0), hdr_bg),
                ('BACKGROUND', (1,0), (1,0), st_bg),
                ('PADDING', (0,0), (-1,-1), 7),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('ROUNDEDCORNERS', [4]),
            ]))
            block_elements.append(hdr_table)
            block_elements.append(Spacer(1, 0.15*cm))

            # Dane szczegółowe
            detail_rows = [
                ["Identyfikator:", w.get("id","—")[:36]],
                ["Typ komunikatu:", w.get("msg_type","Alert")],
                ["Obowiązuje od:", _fmt_dt(w.get("onset",""))],
                ["Obowiązuje do:", _fmt_dt(w.get("expires",""))],
                ["Zasięg obszarowy:", area_desc],
            ]
            detail_table = Table(
                [[Paragraph(r[0], ParagraphStyle('dl', fontSize=8, fontName=_FONT_BOLD,
                             textColor=colors.HexColor("#475569"))),
                  Paragraph(str(r[1]), style_body)]
                 for r in detail_rows],
                colWidths=[4*cm, 13*cm])
            detail_table.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('PADDING', (0,0), (-1,-1), 3),
                ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
            ]))
            block_elements.append(detail_table)

            # Województwa z powiatami
            if voiv_groups:
                block_elements.append(Spacer(1, 0.15*cm))
                block_elements.append(Paragraph("Obszar ostrzeżenia:",
                    ParagraphStyle('al', fontSize=8, fontName=_FONT_BOLD,
                                   textColor=colors.HexColor("#475569"))))
                for vn, names in sorted(voiv_groups.items()):
                    names_str = ", ".join(sorted(names))
                    block_elements.append(Paragraph(
                        f'<b>woj. {vn}:</b> {names_str}',
                        ParagraphStyle('vl', fontSize=7, leading=10, fontName=_FONT_REGULAR,
                                       textColor=colors.HexColor("#374151"))))

            # Parametry meteo
            params = w.get("params", {})
            if params:
                block_elements.append(Spacer(1, 0.15*cm))
                param_lines = []
                param_map = {
                    "gust_kmh": "Porywy wiatru", "avg_kmh": "Prędkość średnia",
                    "wind_dir": "Kierunek wiatru", "rain_mm": "Suma opadów",
                    "snow_cm": "Przyrost pokrywy śn.", "tmin": "Temp. minimalna",
                    "tmax": "Temp. maksymalna", "visibility_m": "Widzialność",
                    "hours": "Czas trwania",
                }
                units = {
                    "gust_kmh": "km/h", "avg_kmh": "km/h", "rain_mm": "mm",
                    "snow_cm": "cm", "tmin": "°C", "tmax": "°C",
                    "visibility_m": "m", "hours": "h",
                }
                for k, v in params.items():
                    if v is None or v is False or v == "": continue
                    label = param_map.get(k, k)
                    unit = units.get(k, "")
                    param_lines.append(f"{label}: <b>{v} {unit}</b>".strip())
                if param_lines:
                    block_elements.append(Paragraph(
                        "Parametry: " + " · ".join(param_lines),
                        ParagraphStyle('pl', fontSize=8, fontName=_FONT_REGULAR,
                                       textColor=colors.HexColor("#374151"))))

            # Opis przebiegu, skutki i zalecenia
            if w.get("description"):
                block_elements.append(Spacer(1, 0.15*cm))
                block_elements.append(Paragraph(
                    "Przebieg:",
                    ParagraphStyle('sl', fontSize=8, fontName=_FONT_BOLD,
                                   textColor=colors.HexColor("#475569"))))
                block_elements.append(Paragraph(
                    f'<i>{w["description"]}</i>', style_body))

            if w.get("impacts"):
                block_elements.append(Spacer(1, 0.1*cm))
                block_elements.append(Paragraph(
                    "Spodziewane skutki:",
                    ParagraphStyle('sl2', fontSize=8, fontName=_FONT_BOLD,
                                   textColor=colors.HexColor("#475569"))))
                for line in w["impacts"].split("\n"):
                    if line.strip():
                        block_elements.append(Paragraph(
                            line.strip(), style_body))

            if w.get("instruction"):
                block_elements.append(Spacer(1, 0.1*cm))
                block_elements.append(Paragraph(
                    "Zalecenia — co robić:",
                    ParagraphStyle('sl3', fontSize=8, fontName=_FONT_BOLD,
                                   textColor=colors.HexColor("#475569"))))
                for line in w["instruction"].split("\n"):
                    if line.strip():
                        block_elements.append(Paragraph(
                            line.strip(), style_body))

            block_elements.append(Spacer(1, 0.4*cm))
            story.append(KeepTogether(block_elements))

    # === STOPKA ===
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=0.5,
                            color=colors.HexColor("#e2e8f0")))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        f"Dokument wygenerowany automatycznie przez MeteoCAP Editor · "
        f"IMGW-PIB Centrum Modelowania Meteorologicznego · {now_str}",
        style_footer))
    story.append(Paragraph(
        "Ostrzeżenia meteorologiczne są wydawane zgodnie z kryteriami IMGW-PIB "
        "i standardem CAP 1.2 (Common Alerting Protocol).",
        style_footer))

    doc.build(story)
    buf.seek(0)
    return buf.read()
