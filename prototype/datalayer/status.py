"""'Is it still in service?' classification for a water monument (v2).

Every monument gets exactly one status:
  'nu'       works for your dry feet today (part of the current water system)
  'vroeger'  worked in the past (heritage, museum, out of service, or only turns for show / in circuit)
  'onbekend' no reliable source either way
  'nvt'      not a water machine (a house, boundary post, office) - the question does not apply

The status is derived ONLY from quoted source statements. Each statement is kept as evidence with its
source, URI and (where known) date, so the app can show *why*. Precedence, strongest first:
  1. Nederlandse Molendatabase 'bestemming' / 'bedrijfsvaardigheid' (curated, dated per mill)
  2. Water board asset register IMWA (PDOK): a name-confirmed match (<=150 m, same function, shared name)
  3. RCE monument description: a sentence that literally says the object is (no longer) in use
     (descriptions are undated, so a 'still in use' sentence alone gives 'nu' with a caveat)
Rules are deliberately narrow; anything else stays 'onbekend'.
"""
import re

NOT_A_MACHINE = {"Polderhuis", "Waterschapshuis", "Sluiswachterswoning", "Sluismeesterswoning",
                 "Sluiswachtershuisje", "Dijkpaal"}

# Molendatabase 'bestemming' patterns
MDB_PAST = re.compile(r"\bvh\.|voorheen|buiten bedrijf|^geen\b", re.I)
MDB_OTHER_USE = re.compile(r"woning|museum(?!terrein)|zalencentrum|restaurant|siermolen", re.I)  # only if it does not also drain
MDB_DRAIN = re.compile(r"bemal|onderbemal|uitmal|opmal|afwater", re.I)
MDB_OTHER_WATER = re.compile(r"inmaler|waterververs|natuurgebied|recreatie|plantsoen|museumterrein|ijsbaan", re.I)
MDB_VOLUNTARY = re.compile(r"vrijwil", re.I)
NOT_WATER_FUNCTIONS = re.compile(r"^(korenmolen|oliemolen|zaagmolen|pelmolen|run|verfmolen|papiermolen|"
                                 r"snuifmolen|kopermolen|schorsmolen|houtzaagmolen|geen traditionele molenfunctie)", re.I)

# RCE description sentences (the object itself, explicit wording only)
RCE_PAST = re.compile(r"[^.]*\b(buiten (gebruik|werking|bedrijf)|niet (meer )?in (gebruik|werking|bedrijf)|"
                      r"(thans|nu) (onderdeel van|ingericht als) [^.]*museum)\b[^.]*\.", re.I)
RCE_NOW = re.compile(r"[^.]*\b(nog (steeds |altijd )?in (gebruik|functie|bedrijf|werking)|"
                     r"nu in bedrijf)\b[^.]*\.", re.I)
RCE_NOISE = re.compile(r"doorlaat|uiterwaard|schuivenhuis|perskolk|verbinding", re.I)  # sentence is about a part, not the object
RCE_PAST_TENSE = re.compile(r"\b(lange tijd|bleef|bleven|destijds|toen|tot (in )?\d{4})\b", re.I)  # 'was still in use back then


def _ev(source, uri, quote, date=None, label=None):
    return {"source": source, "uri": uri, "quote": quote, "date": date, "label": label}


def from_molendatabase(rec):
    """Return (status, sublabel, evidence) from a molendatabase.nl record, or None."""
    if not rec or rec.get("error"):
        return None
    fun, ready, dest = rec.get("functie") or "", rec.get("bedrijfsvaardigheid") or "", rec.get("bestemming") or ""
    quote = "; ".join(f"{k}: {v}" for k, v in (("functie", fun), ("bedrijfsvaardigheid", ready), ("bestemming", dest)) if v)
    ev = _ev("Nederlandse Molendatabase", rec["url"], quote, rec.get("updated"))
    if fun and NOT_WATER_FUNCTIONS.match(fun) and "polder" not in fun.lower():
        return "nvt", f"geen watermolen (functie volgens de Molendatabase: {fun})", ev
    r = ready.lower()
    if "circuit" in r and "naar keuze" not in r:
        return "vroeger", "draait alleen nog rond (maalvaardig in circuit), verzet geen polderwater", ev
    if re.search(r"in herstel|in restauratie|niet draaivaardig|tijdelijk", r):
        return ("vroeger", "bemaalt de polder niet meer", ev) if MDB_PAST.search(dest) else ("onbekend", "tijdelijk buiten werking, in herstel of niet draaivaardig", ev)
    if r.startswith("draaivaardig"):
        return "vroeger", "de wieken draaien, maar de molen kan geen water verzetten (draaivaardig, niet maalvaardig)", ev
    if MDB_PAST.search(dest) or (MDB_OTHER_USE.search(dest) and not MDB_DRAIN.search(dest)):
        return "vroeger", "bemaalt de polder niet meer", ev
    if MDB_OTHER_WATER.search(dest) and not re.search(r"bemalen van (de |het )?(polder|waterschap|district)", dest, re.I):
        return "vroeger", "verzet nog water, maar voor natuur, recreatie of museum, niet voor de afwatering", ev
    if MDB_DRAIN.search(dest):
        if MDB_VOLUNTARY.search(dest):
            return "nu", "maalt mee als aanvulling op het gemaal, op vrijwillige basis", ev
        return "nu", "bemaalt de polder", ev
    return None


def from_imwa(match):
    """Name-confirmed IMWA match -> 'nu'. Unconfirmed proximity matches are only a hint."""
    if not match:
        return None
    a = match["asset"]
    cap = f", max. {a['capaciteit']} m³/min" if a.get("capaciteit") else ""
    fun = f", functie: {a['functie']}" if a.get("functie") else ""
    quote = f"{a.get('naam') or a.get('id')} ({a.get('id')}){fun}{cap}, beheerder {a.get('waterbeheerder')}, status {a.get('status') or 'onbekend'}"
    ev = _ev("Waterschapsregister IMWA (PDOK)", a["uri"], quote, match.get("harvested"))
    if match["nameTokens"]:
        return "nu", f"staat in het actuele register van {a.get('waterbeheerder')} ({match['distance']} m, zelfde naam)", ev
    ev["label"] = f"mogelijk dezelfde: actueel object op {match['distance']} m, naam komt niet overeen (niet bevestigd)"
    return "hint", ev["label"], ev


def from_rce(desc, register_url):
    out = []
    for status, pat in (("vroeger", RCE_PAST), ("nu", RCE_NOW)):
        for m in pat.finditer(desc or ""):
            s = " ".join(m.group(0).split())
            if RCE_NOISE.search(s) or len(s) > 260 or (status == "nu" and RCE_PAST_TENSE.search(s)):
                continue
            out.append((status, _ev("Rijksmonumentenregister (RCE), omschrijving zonder datum", register_url, s)))
    return out


def classify(types, desc, register_url, mdb_rec, imwa_match, wd_instances, wd_item=None):
    evidence, hint = [], None
    mdb = from_molendatabase(mdb_rec)
    imwa = from_imwa(imwa_match)
    rce = from_rce(desc, register_url)
    if imwa and imwa[0] == "hint":
        hint, imwa = imwa[2], None
    for r in (mdb, imwa):
        if r:
            evidence.append(dict(r[2], label=r[1], status=r[0]))
    for st, ev in rce:
        evidence.append(dict(ev, status=st))
    museum = "museum" in {i.lower() for i in wd_instances}
    if museum:
        # A museum can still be in service (Woudagemaal). Only counts as 'vroeger' when nothing says 'nu'.
        evidence.append(dict(_ev("Wikidata (P31 is een)", wd_item, "is een: museum"), status="vroeger"))

    if mdb:
        status, sub = mdb[0], mdb[1]
    elif imwa:
        status, sub = "nu", imwa[1]
    elif any(e["status"] == "vroeger" and e["source"].startswith("Rijks") for e in evidence):
        status, sub = "vroeger", "volgens de monumentomschrijving buiten gebruik"
    elif museum:
        status, sub = "vroeger", "is nu een museum (volgens Wikidata)"
    elif any(e["status"] == "nu" for e in evidence):
        status, sub = "nu", "volgens de monumentomschrijving nog in gebruik (datum van die tekst onbekend)"
    elif set(types) <= NOT_A_MACHINE:
        status, sub = "nvt", "gebouw of markering, geen werktuig"
    else:
        status, sub = "onbekend", "geen bron gevonden die zegt of dit nog werkt"
    if museum and status == "nu":
        for e in evidence:
            if e["source"].startswith("Wikidata (P31"):
                e["status"] = "info"
        sub += "; ook te bezoeken als museum"
    conflict = len({e["status"] for e in evidence if e["status"] in ("nu", "vroeger")}) > 1
    if hint:
        evidence.append(dict(hint, status="hint"))
    return {"status": status, "label": sub, "conflict": conflict, "evidence": evidence}
