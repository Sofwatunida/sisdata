import json
import re
import sys
from pathlib import Path

import pymupdf


def main():
    if len(sys.argv) < 6:
        raise SystemExit("Usage: extract_pdf_structure.py <pdf> <output> <period_name> <period_year> <source_file>")
    pdf_path, output_path, period_name, period_year, source_file = sys.argv[1:6]
    page = pymupdf.open(pdf_path)[0]
    tables = page.find_tables().tables
    if not tables:
        raise SystemExit("Tidak ada tabel yang dikenali pada PDF")
    rows = tables[0].rows
    if len(rows) < 3:
        raise SystemExit("Tabel PDF terlalu pendek")

    def text(box):
        return " ".join(page.get_textbox(pymupdf.Rect(box)).split()) if box else ""

    def is_phone(value):
        return bool(re.fullmatch(r"0[\d\s/]+", value.strip())) and len(re.sub(r"\D", "", value)) >= 8

    fields = []
    field_boxes = []
    for i, row in enumerate(rows[2:], 2):
        box = row.cells[5]
        if not box:
            continue
        label = text(box)
        if not label:
            continue
        name = ""
        phone = ""
        for j in range(i, len(rows)):
            cell = rows[j].cells[4]
            if not cell:
                continue
            center_y = (cell[1] + cell[3]) / 2
            if center_y < box[1] - 0.1:
                continue
            if center_y > box[3] + 0.1:
                break
            value = text(cell)
            if not value:
                continue
            if is_phone(value):
                if not phone:
                    phone = value
            elif not name:
                name = value
        fields.append({
            "name": label,
            "sort_order": len(fields) + 1,
            "coordinators": [{"name": name, "phone": phone, "notes": "", "sort_order": 1}],
            "divisions": [],
        })
        field_boxes.append((label, box))

    if not fields:
        raise SystemExit("Tidak ada bidang yang dikenali pada PDF")

    for i, row in enumerate(rows[2:], 2):
        no_text = text(row.cells[0])
        if not no_text.isdigit():
            continue
        no = int(no_text)
        cell = row.cells[1]
        if not cell:
            continue
        center_y = (cell[1] + cell[3]) / 2
        field_index = None
        for idx, (_, box) in enumerate(field_boxes):
            if box[1] - 0.1 <= center_y <= box[3] + 0.1:
                field_index = idx
                break
        if field_index is None:
            raise SystemExit(f"Bidang tidak ditemukan untuk baris {no}")
        fields[field_index]["divisions"].append({
            "source_no": no,
            "name": text(cell),
            "leader_name": text(row.cells[2]),
            "leader_phone": text(row.cells[3]),
            "notes": "",
            "sort_order": no,
            "source_row": no + 2,
        })

    division_count = sum(len(field["divisions"]) for field in fields)
    if not division_count:
        raise SystemExit("Tidak ada divisi yang dikenali pada PDF")

    result = {
        "period": {
            "name": period_name,
            "year": period_year,
            "status": "aktif",
            "description": "Struktur koordinasi hasil impor PDF",
            "source_file": source_file,
        },
        "source_file": source_file,
        "source_sheet": "Sheet1",
        "fields": fields,
    }
    Path(output_path).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"fields": len(fields), "divisions": division_count}, ensure_ascii=False))


if __name__ == "__main__":
    main()
