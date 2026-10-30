"""Open map services used by Droge Voeten (v2, extended in v3). Every entry was checked on 2026-10-27 (v2) or 2026-10-28 (v3):
GetCapabilities answered, GetMap returned a PNG and (where 'queryable') GetFeatureInfo returned JSON
with 'Access-Control-Allow-Origin: *', so a browser app can call them directly.

The list is part of the koppelvlak (data/build/droge-voeten.jsonld -> "services"), so any front end can
draw the same layers without knowing the endpoints itself. Text fields are Dutch (shown to end users).
"""

LIWO = "https://basisinformatie-overstromingen.nl/geoserver/ows"
LIWO_DOC = ("https://iplo.nl/publish/pages/245268/11211536-000-zws-0003_v1-0-technische-uitgangspunten-en-methode-"
            "liwo-afgeleide-kaarten_voor-publ.pdf")
LIWO_KANS = [  # verified via LIWO GetLayerSet (layerset 1) on 2026-10-27, see proofs/liwo_layerset1.json
    ("Kaart1", "grote kans", "meer dan 1/30 per jaar"),
    ("Kaart2", "middelgrote kans", "1/30 tot 1/300 per jaar"),
    ("Kaart3", "kleine kans", "1/300 tot 1/3.000 per jaar"),
    ("Kaart4", "zeer kleine kans", "1/3.000 tot 1/30.000 per jaar"),
    ("Kaart5", "extreem kleine kans", "minder dan 1/30.000 per jaar (deze kaart toont ook overstroomik.nl)"),
]

ZLD_1560 = ["rasters:GEORMA_TOPARDBRG1560RST", "rasters:GEORMA_TOPAXL1560RST", "rasters:GEORMA_TOPBRWHVN1560RST",
            "rasters:GEORMA_TOPGOE1560RST", "rasters:GEORMA_TOPHLS1560RST", "rasters:GEORMA_TOPMBGARN1560RST",
            "rasters:georma_topostbrg1560rst", "rasters:GEORMA_TOPRMW1560RST", "rasters:GEORMA_TOPSLS1560RST",
            "rasters:GEORMA_TOPSMD1560RST", "rasters:GEORMA_TOPTHL1560RST", "rasters:GEORMA_TOPVLS1560RST",
            "rasters:GEORMA_TOPVRE1560RST", "rasters:georma_topwkp1560rst", "rasters:GEORMA_TOPZRK1560RST"]
ZLD_HATTINGA = ["rasters_hattinga:georma_htnnbv1750clprst", "rasters_hattinga:georma_htnsdv1750clprst",
                "rasters_hattinga:georma_htnthl1750clprst", "rasters_hattinga:georma_htnwlh1750clprst",
                "rasters_hattinga:georma_htnzbv1750clprst", "rasters_hattinga:georma_htnzvl1750clprst"]

SERVICES = [
    {"id": "achtergrond", "kind": "wmts", "name": "Achtergrondkaart (BRT, grijs)", "publisher": "Kadaster / PDOK",
     "url": "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png",
     "license": "AccessConstraints in de capabilities: none (bron vermelden: Kadaster / PDOK)", "base": True},
    {"id": "waterschappen", "kind": "wms", "name": "Waterschapsgrenzen", "publisher": "Het Waterschapshuis / PDOK",
     "url": "https://service.pdok.nl/hwh/waterschappen-administratieve-eenheden/wms/v1_0",
     "layer": "AU.AdministrativeUnit", "style": "AU.AdministrativeUnit.Alternative", "queryable": True, "default": True,
     "about": "Grenzen van de 21 waterschappen (INSPIRE). Wij vragen hiermee per adres op welk waterschap er beheert.",
     "license": "https://creativecommons.org/publicdomain/zero/1.0/"},
    {"id": "peilgebieden", "kind": "wms", "name": "Peilgebieden", "publisher": "Het Waterschapshuis / PDOK (IMWA)",
     "url": "https://service.pdok.nl/hwh/waterschappen-waterbeheergebieden-imwa/wms/v2_0", "layer": "peilgebied",
     "about": "Gebieden waarin het waterschap één waterpeil aanhoudt. Het peil zelf staat niet in deze open dataset.",
     "license": "CC0 volgens de WMS-capabilities, CC BY-SA 4.0 volgens de OGC API van dezelfde dataset; wij hanteren de strengste: CC BY-SA 4.0"},
    {"id": "afvoergebieden", "kind": "wms", "name": "Afvoer- en bemalingsgebieden", "publisher": "Het Waterschapshuis / PDOK (IMWA)",
     "url": "https://service.pdok.nl/hwh/waterschappen-waterbeheergebieden-imwa/wms/v2_0", "layer": "afvoergebiedaanvoergebied",
     "about": "Gebieden die via één gemaal of watergang afwateren. Niet elk waterschap levert deze laag aan.",
     "license": "CC0 volgens de WMS-capabilities, CC BY-SA 4.0 volgens de OGC API van dezelfde dataset; wij hanteren de strengste: CC BY-SA 4.0"},
    {"id": "gemalen", "kind": "wms", "name": "Gemalen van nu (waterschapsregister)", "publisher": "Het Waterschapshuis / PDOK (IMWA)",
     "url": "https://service.pdok.nl/hwh/waterschappen-kunstwerken-imwa/wms/v2_0", "layer": "gemaal", "default": True,
     "about": "Alle gemalen die de waterschappen nu beheren (ruim 8.500).",
     "license": "CC0 volgens de WMS-capabilities, CC BY-SA 4.0 volgens de OGC API van dezelfde dataset; wij hanteren de strengste: CC BY-SA 4.0"},
    {"id": "ahn", "kind": "wms", "name": "Hoogte van het maaiveld (AHN, 0,5 m)", "publisher": "Rijkswaterstaat / PDOK",
     "url": "https://service.pdok.nl/rws/ahn/wms/v1_0", "layer": "dtm_05m", "queryable": True, "opacity": 0.6,
     "about": "Actueel Hoogtebestand Nederland, maaiveld in meters ten opzichte van NAP.",
     "license": "https://creativecommons.org/publicdomain/zero/1.0/"},
    {"id": "liwo", "kind": "wms", "name": "Overstroming bij dijkdoorbraak: maximale waterdiepte (LIWO)",
     "publisher": "Rijkswaterstaat, opgesteld door Deltares", "url": LIWO, "style": "LIWO_Basis_Waterdiepte",
     "layer": "LIWO_Basis:MaximaleWaterdiepteNederland_Kaart5", "queryable": True, "unit": "m", "opacity": 0.7,
     "variants": [{"layer": f"LIWO_Basis:MaximaleWaterdiepteNederland_{k}", "name": n, "probability": p} for k, n, p in LIWO_KANS],
     "about": ("Modeluitkomst: de grootste waterdiepte die bij een overstroming vanuit zee, rivier of regionaal water op deze "
               "plek kan optreden. Samengesteld uit vele scenario's die nooit allemaal tegelijk gebeuren. Gaat over "
               "dijkdoorbraken, niet over een uitgevallen gemaal."),
     "documentation": LIWO_DOC, "viewer": "https://basisinformatie-overstromingen.nl/#/maps",
     "license": "AccessConstraints in de capabilities: none (geen expliciete licentie vermeld)"},
    {"id": "stroombanen", "kind": "wms", "name": "Waar regenwater naartoe stroomt bij 70 mm in 1 uur (Klimaateffectatlas)",
     "publisher": "Klimaateffectatlas (Stichting CAS)",
     "url": "https://cas.cloud.sogelink.com/public/data/org/gws/YWFMLMWERURF/kea_public/wms",
     "layer": "nl_stroombanen_70mm_1h_v20260820", "opacity": 0.8,
     "about": "Modeluitkomst: stroombanen van regenwater over het maaiveld bij een hoosbui van 70 mm in een uur.",
     "license": "AccessConstraints in de capabilities: none (geen expliciete licentie vermeld)"},
    {"id": "zeeland90", "kind": "wms", "name": "Zeeland: waterdiepte bij 90 mm regen in 1 uur",
     "publisher": "Provincie Zeeland", "url": "https://opengeodata.zeeland.nl/geoserver/klimaat/wms",
     "layer": "klimaat:Totaal_maximale_waterdiepte_90mm_clipwater_2mbuffer_COG", "queryable": True, "unit": "m", "opacity": 0.7,
     "bbox": [3.3388, 51.1922, 4.2816, 51.7631],
     "about": "Modeluitkomst (alleen Zeeland): maximale waterdiepte op straat na een extreme bui van 90 mm in een uur.",
     "documentation": "https://dataportaal.zeeland.nl/dataportaal/srv/dut/catalog.search#/metadata/6cb3e34a-5239-4b2b-896b-31bd27691a5e",
     "license": "AccessConstraints in de capabilities: none"},
    # ---- v3: historical base maps (Provincie Zeeland geoserver; capabilities: Fees NONE, AccessConstraints NONE;
    # NGR records say "Geen beperkingen"). Layers are combined into one WMS request per map.
    {"id": "kaart1560", "kind": "wms", "group": "historisch", "name": "Zeeland in 1560 (historische stadskaarten)",
     "publisher": "Provincie Zeeland", "url": "https://opengeodata.zeeland.nl/geoserver/wms",
     "layer": ",".join(ZLD_1560), "opacity": 0.9, "bbox": [3.3388, 51.1922, 4.2816, 51.7631],
     "about": "Gegeorefereerde kaarten uit 1560 rond 15 Zeeuwse steden, waaronder Middelburg & Arnemuiden.",
     "documentation": "https://nationaalgeoregister.nl/geonetwork/srv/dut/catalog.search#/metadata/6813884d-cda1-43f3-acb0-0bab6cfabbe3",
     "license": "Geen beperkingen (Nationaal Georegister); capabilities: AccessConstraints NONE"},
    {"id": "hattinga", "kind": "wms", "group": "historisch", "name": "Zeeland rond 1750 (Hattinga-kaarten)",
     "publisher": "Provincie Zeeland", "url": "https://opengeodata.zeeland.nl/geoserver/wms",
     "layer": ",".join(ZLD_HATTINGA), "opacity": 0.9, "bbox": [3.3388, 51.1922, 4.2816, 51.7631],
     "about": "Kaarten van de Zeeuwse eilanden door de familie Hattinga, omstreeks 1750.",
     "license": "capabilities: AccessConstraints NONE (geen expliciete licentie per laag gevonden)"},
    {"id": "pourbus", "kind": "wms", "group": "historisch", "name": "Brugse Vrije in 1571 (Pourbus)",
     "publisher": "Provincie Zeeland (laag HistorischeKaartenVlaanderen:pourbus)", "url": "https://opengeodata.zeeland.nl/geoserver/wms",
     "layer": "HistorischeKaartenVlaanderen:pourbus", "opacity": 0.9, "bbox": [2.52, 50.64, 5.94, 51.51],
     "about": "De geschilderde kaart van het Brugse Vrije door Pieter Pourbus (1571), gegeorefereerd. Dekt Zeeuws-Vlaanderen, niet Walcheren.",
     "license": "capabilities: AccessConstraints NONE (geen expliciete licentie per laag gevonden)"},
]
