"""Extrait les fichiers XLSX 2026 en JSON brut (étape 1 du jeu de données de démo).

Usage : python3 -I tools/extract_2026.py <client.xlsx> <repartition.xlsx> <laserstyle.xlsx> <sortie.json>
"""
import json
import sys
import datetime as dt

import openpyxl


def val(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dt.time):
        return v.strftime("%H:%M")
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        return v.strip()
    return v


def gie(v):
    if v is None or v == "":
        return ""
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(3) if s.isdigit() else s


def main(client, repart, laser, out):
    # --- Fichier client ---
    ws = openpyxl.load_workbook(client, data_only=True)["CATEGORIES CONFONDUES"]
    head = [str(h or "").strip() for h in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
    client_rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not any(r[1:14]):
            continue
        client_rows.append({head[i]: val(r[i]) for i in range(1, 14)})

    # --- Répartition (état corrigé par Julia) ---
    wb = openpyxl.load_workbook(repart, data_only=True)
    wbs = openpyxl.load_workbook(repart)  # pour les couleurs
    rep, rep_s = wb["Répartition"], wbs["Répartition"]
    rep_rows = []
    for i, r in enumerate(rep.iter_rows(min_row=2, values_only=True), start=2):
        if not any(r[1:10]):
            continue
        try:
            rgb = rep_s.cell(row=i, column=5).fill.fgColor.rgb
            rgb = rgb if isinstance(rgb, str) else None
        except Exception:
            rgb = None
        rep_rows.append({
            "gie": gie(r[1]), "ref": val(r[2]), "gie_nom": val(r[3]), "agence": val(r[4]),
            "civilite": val(r[5]), "nom": val(r[6]), "categorie": val(r[7]), "recompense": val(r[8]),
            "couleur": rgb,
        })

    lg = wb["Listing GIE"]
    gies = []
    for r in lg.iter_rows(min_row=3, values_only=True):
        if not r[0]:
            continue
        code, _, nom = str(r[0]).partition(" - ")
        gies.append({
            "code": gie(code), "nom": nom.strip(), "verif": val(r[6]), "bat": val(r[7]),
            "souhait": val(r[8]), "adresse": val(r[9]), "statut": val(r[10]),
            "date_envoi": val(r[11]), "date_livraison": val(r[12]), "commentaires": val(r[13]),
        })

    lv = wb["Livraisons"]
    livraisons = []
    for r in lv.iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        livraisons.append({
            "code": gie(r[0]), "nom_gie": val(r[1]), "nom": val(r[2]), "prenom": val(r[3]),
            "contact": val(r[4]), "adresse": val(r[5]), "convention": val(r[6]), "priorite": val(r[7]),
        })

    # --- Laser Style : références + vagues ---
    wl = openpyxl.load_workbook(laser, data_only=True)
    cat = wl["Catégories"]
    refs, metal = [], None
    for r in cat.iter_rows(min_row=2, values_only=True):
        if r[0]:
            metal = str(r[0]).strip().capitalize()
        if isinstance(r[1], (int, float)) and r[2]:
            refs.append({"num": int(r[1]), "metal": metal, "libelle": str(r[2]).strip(),
                         "total_laser": val(r[3]), "vague1": val(r[5])})
    exp = openpyxl.load_workbook(laser)["Exports réussites"]
    vague1 = [gie(row[0].value) for row in exp.iter_rows(min_row=2)
              if row[0].value and row[0].fill.fgColor.rgb == "FFFFFF00"]

    json.dump({"client": client_rows, "repartition": rep_rows, "gies": gies,
               "livraisons": livraisons, "references": refs, "vague1": vague1},
              open(out, "w"), ensure_ascii=False, indent=1)
    print(len(client_rows), len(rep_rows), len(gies), len(livraisons), len(refs), len(vague1))


if __name__ == "__main__":
    main(*sys.argv[1:5])
