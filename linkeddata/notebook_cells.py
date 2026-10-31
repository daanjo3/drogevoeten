"""Cells of the notebooks for the datasets after the pilot (see make_sparqlbook.py, which tests and writes them).

Conventions (CLAUDE.md): choose one language for every name (FILTER(LANG(?x) = "nl")); follow shared nodes, not
address text; queries must return rows and no duplicate rows; nothing may depend on reviewed sameAs links only.
A cell is ("md", text) or ("q", query) or ("q", query, [files]) to use other files than the notebook's default.
"""


def intro(title, what, files, extra=""):
    names = ", ".join(f"`build/{f}`" for f in files)
    return ("md", f"""# {title}

{what}

**Eerst:** draai `make` in `linkeddata/`, zodat {names} bestaan. Elke query laadt de bestanden lokaal (Oxigraph); bij grote bestanden duurt dat even. Open dit bestand in VS Code met de extensie *SPARQL Notebook* (Zazuko) en klik op ▶ bij een cel.

## Hoe de data is opgebouwd

- Elk object is een record (`schema:CreativeWork` voor gebouwde objecten, `schema:Place` voor gebieden) met IRI `urn:drogevoeten:id:<soort>:<sleutel>`. Wat alleen bij dat record hoort, heeft een IRI eronder (`#location`, `#image`, `#…-id`, en gebeurtenissen als `#construction` of `#disappearance`).
- Wat ook bij andere records voorkomt, is een gedeelde knoop: termen `urn:drogevoeten:term:<veld>:<waarde>` (in een termenset `termset:<veld>`), plaatsen `urn:drogevoeten:place:<veld>:…` en organisaties `urn:drogevoeten:org:…`. Termensets gelden voor alle datasets, dus dezelfde term in twee datasets is dezelfde knoop.
- Gebeurtenissen (`schema:Event`) wijzen met `schema:about` naar hun record en bewaren de jaartekst uit de bron (`dv:dateText`) en de zekerheid (`dv:datePrecision`).
- Inhoud is Nederlands (`@nl`); eigen termen en termensets hebben ook een Engelse naam. Kies in een query daarom één taal.{extra}""")


ZLD = ["zeeland-dikes.ttl", "zeeland-polders.ttl", "gift-houses-1953.ttl", "drowned-villages.ttl", "delta-works.ttl"]

WINDMILLS = [
    intro("Molens en verdwenen molens als linked data",
          "Deze notebook bevraagt twee datasets samen: de bestaande molens en de verdwenen molens uit de RCE Landschapsatlas. Ze delen hun termensets (type, functie, hoofdcategorie, aandrijving, staat), omdat beide uit de molendatabase komen.",
          ["windmills.ttl", "lost-windmills.ttl"]),
    ("md", "## 1. Twee datasets, één soort object\n\nAantal molens per dataset. Beide gebruiken onze eigen objectsoort `object-type:windmill`."),
    ("q", """SELECT ?dataset (COUNT(?m) AS ?molens) WHERE {
  ?m schema:additionalType <urn:drogevoeten:term:object-type:windmill> ;
     schema:isPartOf/schema:name ?dataset .
}
GROUP BY ?dataset"""),
    ("md", "## 2. Molentypen in beide datasets\n\nDe termenset `windmill-type` is gedeeld: een wipmolen in de ene dataset is dezelfde knoop als een wipmolen in de andere."),
    ("q", """SELECT ?type (COUNT(DISTINCT ?bestaand) AS ?bestaand_) (COUNT(DISTINCT ?verdwenen) AS ?verdwenen_) WHERE {
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:windmill-type> ;
     schema:name ?type .
  ?m schema:additionalType ?t .
  OPTIONAL { ?m schema:isPartOf <urn:drogevoeten:dataset:windmills> . BIND(?m AS ?bestaand) }
  OPTIONAL { ?m schema:isPartOf <urn:drogevoeten:dataset:lost-windmills> . BIND(?m AS ?verdwenen) }
}
GROUP BY ?type
ORDER BY DESC(?verdwenen_)
LIMIT 20"""),
    ("md", "## 3. Bestaande molens naar staat"),
    ("q", """SELECT ?staat (COUNT(?m) AS ?molens) WHERE {
  ?m schema:isPartOf <urn:drogevoeten:dataset:windmills> ;
     schema:creativeWorkStatus/schema:name ?staat .
}
GROUP BY ?staat
ORDER BY DESC(?molens)""", ["windmills.ttl"]),
    ("md", "## 4. De oudste bestaande molens\n\nMet een zeker bouwjaar (`schema:dateCreated`) en hun woonplaats (gedeelde knoop)."),
    ("q", """SELECT ?naam ?bouwjaar ?woonplaats ?type WHERE {
  ?m schema:isPartOf <urn:drogevoeten:dataset:windmills> ;
     schema:name ?naam ;
     schema:dateCreated ?bouwjaar ;
     schema:locationCreated/schema:containedInPlace/schema:name ?woonplaats .
  OPTIONAL { ?m schema:additionalType ?t . ?t schema:inDefinedTermSet <urn:drogevoeten:termset:windmill-type> ; schema:name ?type }
}
ORDER BY ?bouwjaar
LIMIT 15""", ["windmills.ttl"]),
    ("md", "## 5. Wanneer verdwenen de molens?\n\nVerdwijningen per decennium. Let op de pieken rond 1850 en 1929: daar staan verzameljaren in de bron, die als `onzeker` zijn gemarkeerd (zie query 6)."),
    ("q", """SELECT ?decennium (COUNT(?e) AS ?verdwenen) WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:disappearance> ;
     schema:startDate ?d .
  BIND(xsd:integer(FLOOR(xsd:integer(SUBSTR(STR(?d), 1, 4)) / 10) * 10) AS ?decennium)
}
GROUP BY ?decennium
ORDER BY ?decennium""", ["lost-windmills.ttl"]),
    ("md", "## 6. Hoe zeker zijn de jaartallen?\n\nAantal gebeurtenissen per soort en zekerheid. `onzeker` = een verzameljaar (bijv. bouwjaar 1832, dat 3.955 keer voorkomt); `voor` = het jaar is een uiterste grens."),
    ("q", """SELECT ?soort ?zekerheid (COUNT(?e) AS ?gebeurtenissen) (SAMPLE(?tekst) AS ?voorbeeld) WHERE {
  ?e a schema:Event ;
     schema:additionalType/schema:name ?soort ;
     dv:datePrecision ?zekerheid .
  FILTER(LANG(?soort) = "nl")
  OPTIONAL { ?e dv:dateText ?tekst }
}
GROUP BY ?soort ?zekerheid
ORDER BY ?soort DESC(?gebeurtenissen)""", ["lost-windmills.ttl"]),
    ("md", "## 7. Eén verdwenen molen met zijn gebeurtenissen\n\nDe Mijndensche Molen (molendatabase-nummer 1053) en alles wat ernaar wijst of eronder hangt."),
    ("q", """CONSTRUCT { ?s ?p ?o . } WHERE {
  ?s ?p ?o .
  FILTER(STRSTARTS(STR(?s), "urn:drogevoeten:id:lost-windmill:1053"))
}""", ["lost-windmills.ttl"]),
    ("md", "## 8. Waar staan de meeste bestaande molens?\n\nWoonplaatsen zijn gedeelde knopen. De molenlaag noemt geen provincie, dus de woonplaatsen hebben de context `no-context`."),
    ("q", """SELECT ?woonplaats (COUNT(?m) AS ?molens) WHERE {
  ?m schema:isPartOf <urn:drogevoeten:dataset:windmills> ;
     schema:locationCreated/schema:containedInPlace ?w .
  ?w schema:name ?woonplaats .
}
GROUP BY ?woonplaats
ORDER BY DESC(?molens)
LIMIT 15""", ["windmills.ttl"]),
    ("md", "## 9. Vooruitblik op fase 2: hetzelfde Ten Bruggencate-nummer\n\nMolens die in beide datasets met hetzelfde Ten Bruggencate-nummer voorkomen. Zo'n gedeeld nummer is de basis voor een linkset in fase 2; nu zijn het nog twee losse records."),
    ("q", """SELECT ?nummer ?bestaand ?verdwenen WHERE {
  ?a schema:isPartOf <urn:drogevoeten:dataset:windmills> ; schema:name ?bestaand ; schema:identifier ?ia .
  ?ia schema:propertyID "Ten Bruggencate-nummer" ; schema:value ?nummer .
  ?b schema:isPartOf <urn:drogevoeten:dataset:lost-windmills> ; schema:name ?verdwenen ; schema:identifier ?ib .
  ?ib schema:propertyID "Ten Bruggencate-nummer" ; schema:value ?nummer .
}
ORDER BY ?nummer
LIMIT 20"""),
]

DRAINED_LAKES = [
    intro("Droogmakerijen en hun maalinrichtingen als linked data",
          "Deze notebook bevraagt de droogmakerijen uit de RCE Landschapsatlas en de molens en gemalen waarmee ze zijn drooggemaakt (`drained-lake-structure`). Een maalinrichting wijst via haar `#location` met `schema:containedInPlace` naar haar droogmakerij.",
          ["drained-lakes.ttl"]),
    ("md", "## 1. Droogmakerijen per poldertype\n\nMet het vroegste en laatste jaar van droogmaking. Bij \"1550 en eerder\" is 1550 een uiterste grens (`endDate`)."),
    ("q", """SELECT ?poldertype (COUNT(DISTINCT ?d) AS ?droogmakerijen) (MIN(?jaar) AS ?vroegst) (MAX(?jaar) AS ?laatst) WHERE {
  ?d schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:drained-lake-type> ; schema:name ?poldertype .
  ?e schema:about ?d ; schema:additionalType <urn:drogevoeten:term:event-type:reclamation> .
  OPTIONAL { ?e schema:startDate ?s } OPTIONAL { ?e schema:endDate ?eind }
  BIND(xsd:integer(SUBSTR(STR(COALESCE(?s, ?eind)), 1, 4)) AS ?jaar)
}
GROUP BY ?poldertype
ORDER BY ?vroegst"""),
    ("md", "## 2. De oudste droogmakerijen"),
    ("q", """SELECT ?naam ?jaartekst ?zekerheid ?polderpeil WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:reclamation> ;
     schema:about ?d ;
     dv:dateText ?jaartekst ;
     dv:datePrecision ?zekerheid .
  ?d schema:name ?naam .
  OPTIONAL { ?d dv:waterLevel ?polderpeil }
  OPTIONAL { ?e schema:startDate ?s } OPTIONAL { ?e schema:endDate ?eind }
}
ORDER BY COALESCE(?s, ?eind)
LIMIT 15"""),
    ("md", "## 3. Waarmee werd drooggemalen?\n\nMaalinrichtingen per soort."),
    ("q", """SELECT ?soort (COUNT(?m) AS ?aantal) WHERE {
  ?m schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:drained-lake-structure-type> ; schema:name ?soort .
}
GROUP BY ?soort
ORDER BY DESC(?aantal)"""),
    ("md", "## 4. Droogmakerijen met de meeste maalinrichtingen"),
    ("q", """SELECT ?droogmakerij (COUNT(?m) AS ?maalinrichtingen) (GROUP_CONCAT(DISTINCT ?soort; separator=", ") AS ?soorten) WHERE {
  ?m schema:locationCreated/schema:containedInPlace ?d ;
     schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:drained-lake-structure-type> ; schema:name ?soort .
  ?d schema:additionalType <urn:drogevoeten:term:object-type:drained-lake> ; schema:name ?droogmakerij .
}
GROUP BY ?droogmakerij
ORDER BY DESC(?maalinrichtingen)
LIMIT 15"""),
    ("md", "## 5. Polderpeil\n\nHet peil staat als tekst zoals in de bron (meters ten opzichte van NAP)."),
    ("q", """SELECT ?polderpeil (COUNT(?d) AS ?droogmakerijen) WHERE {
  ?d dv:waterLevel ?polderpeil .
}
GROUP BY ?polderpeil
ORDER BY DESC(?droogmakerijen)"""),
    ("md", "## 6. Vooruitblik op fase 2: gemalen in twee datasets\n\nEen maalinrichting met een gem_id van de Nederlandse Gemalen Stichting staat ook in de gemalendataset onder hetzelfde nummer. Deze query legt dat verband via het gedeelde nummer; in fase 2 wordt het een linkset."),
    ("q", """SELECT ?droogmakerij ?maalinrichting ?gemaal ?stichtingsjaar WHERE {
  ?m schema:isPartOf <urn:drogevoeten:dataset:drained-lakes> ;
     schema:identifier ?i ; schema:name ?maalinrichting ; schema:locationCreated/schema:containedInPlace/schema:name ?droogmakerij .
  ?i schema:propertyID "Nederlandse Gemalen Stichting gem_id" ; schema:value ?nummer .
  ?g schema:isPartOf <urn:drogevoeten:dataset:pumping-stations> ; schema:name ?gemaal ; schema:identifier ?j .
  ?j schema:propertyID "Nederlandse Gemalen Stichting gem_id" ; schema:value ?nummer .
  OPTIONAL { ?g schema:dateCreated ?stichtingsjaar }
}
ORDER BY ?droogmakerij
LIMIT 20""", ["drained-lakes.ttl", "pumping-stations.ttl"]),
]

LAND_CONSOLIDATION = [
    intro("Landinrichting in Nederland 1924-2015 als linked data",
          "Deze notebook bevraagt de landinrichtingsprojecten uit de RCE Landschapsatlas: ruilverkavelingen en andere vormen, met hun mijlpalen als gebeurtenissen (voorbereiding, goedkeuring, uitvoering, akte, afsluiting).",
          ["land-consolidation.ttl"]),
    ("md", "## 1. Vormen van landinrichting\n\nAantal projecten en totale bruto oppervlakte (ha) per vorm."),
    ("q", """SELECT ?vorm (COUNT(DISTINCT ?p) AS ?projecten) (ROUND(SUM(?ha)) AS ?hectare) WHERE {
  ?p schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:land-consolidation-form> ; schema:name ?vorm .
  OPTIONAL { ?p schema:additionalProperty/schema:value ?ha }
}
GROUP BY ?vorm
ORDER BY DESC(?projecten)"""),
    ("md", "## 2. Per provincie\n\nVia de gedeelde provincieknoop (dezelfde knoop als bij de gemalen)."),
    ("q", """SELECT ?provincie (COUNT(?p) AS ?projecten) WHERE {
  ?p schema:additionalType <urn:drogevoeten:term:object-type:land-consolidation-project> ;
     schema:containedInPlace ?prov .
  ?prov schema:name ?provincie .
}
GROUP BY ?provincie
ORDER BY DESC(?projecten)"""),
    ("md", "## 3. Uitvoering per decennium"),
    ("q", """SELECT ?decennium (COUNT(?e) AS ?projecten) WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:execution> ; schema:startDate ?d .
  BIND(xsd:integer(FLOOR(xsd:integer(SUBSTR(STR(?d), 1, 4)) / 10) * 10) AS ?decennium)
}
GROUP BY ?decennium
ORDER BY ?decennium"""),
    ("md", "## 4. De grootste projecten"),
    ("q", """SELECT ?naam ?ha ?vorm ?status WHERE {
  ?p schema:name ?naam ;
     schema:additionalProperty ?a .
  ?a schema:value ?ha .
  OPTIONAL { ?p schema:additionalType ?t . ?t schema:inDefinedTermSet <urn:drogevoeten:termset:land-consolidation-form> ; schema:name ?vorm }
  OPTIONAL { ?p dv:status/schema:name ?status }
}
ORDER BY DESC(?ha)
LIMIT 15"""),
    ("md", "## 5. Eén project met al zijn mijlpalen"),
    ("q", """SELECT ?project ?mijlpaal ?jaar WHERE {
  ?p schema:name "Walcheren"@nl ; schema:name ?project .
  ?e schema:about ?p ; schema:startDate ?jaar ; schema:additionalType/schema:name ?mijlpaal .
  FILTER(LANG(?mijlpaal) = "nl")
}
ORDER BY ?jaar"""),
    ("md", "## 6. Lopende projecten"),
    ("q", """SELECT ?naam ?provincie ?uitvoering WHERE {
  ?p dv:status/schema:name "lopend"@nl ;
     schema:name ?naam .
  OPTIONAL { ?p schema:containedInPlace/schema:name ?provincie }
  OPTIONAL { ?e schema:about ?p ; schema:additionalType <urn:drogevoeten:term:event-type:execution> ; schema:startDate ?uitvoering }
}
ORDER BY ?uitvoering"""),
]

BREACH_POOLS = [
    intro("Wielen (doorbraakkolken) als linked data",
          "Deze notebook bevraagt de wielen uit de RCE Landschapsatlas: diepe plassen die bij een dijkdoorbraak zijn ontstaan. De rivier waarlangs het wiel ligt en de woonplaats zijn gedeelde knopen (zonder provincie, want de bron noemt die niet).",
          ["breach-pools.ttl"]),
    ("md", "## 1. Langs welke rivier?"),
    ("q", """SELECT ?rivier (COUNT(?w) AS ?wielen) WHERE {
  ?w dv:alongRiver/schema:name ?rivier .
}
GROUP BY ?rivier
ORDER BY DESC(?wielen)
LIMIT 20"""),
    ("md", "## 2. Wielen met een naam\n\nMet hun alternatieve naam als die er is."),
    ("q", """SELECT ?naam ?andereNaam ?woonplaats WHERE {
  ?w schema:additionalType <urn:drogevoeten:term:object-type:breach-pool> ;
     schema:name ?naam .
  FILTER(!CONTAINS(?naam, "(naam onbekend)"))
  OPTIONAL { ?w schema:alternateName ?andereNaam }
  OPTIONAL { ?w schema:containedInPlace/schema:name ?woonplaats }
}
ORDER BY ?naam
LIMIT 30"""),
    ("md", "## 3. Dijkdoorbraken met een jaartal\n\nDe bron noemt maar bij enkele wielen het jaar van ontstaan."),
    ("q", """SELECT ?wiel ?naam ?jaar ?beschrijving WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:dike-breach> ;
     schema:about ?w ;
     schema:startDate ?jaar .
  ?w schema:name ?naam .
  BIND(STRAFTER(STR(?w), "breach-pool:") AS ?wiel)
  OPTIONAL { ?w schema:description ?beschrijving }
}
ORDER BY ?jaar"""),
    ("md", "## 4. Woonplaatsen met de meeste wielen"),
    ("q", """SELECT ?woonplaats (COUNT(?w) AS ?wielen) WHERE {
  ?w schema:additionalType <urn:drogevoeten:term:object-type:breach-pool> ;
     schema:containedInPlace/schema:name ?woonplaats .
}
GROUP BY ?woonplaats
ORDER BY DESC(?wielen)
LIMIT 15"""),
    ("md", "## 5. Wielen met foto\n\nDe foto's worden gelinkt, niet gekopieerd; de licentie is niet beoordeeld."),
    ("q", """SELECT ?naam ?foto ?fotograaf WHERE {
  ?w schema:name ?naam ;
     schema:associatedMedia ?m .
  ?m schema:thumbnailUrl ?foto .
  OPTIONAL { ?m schema:copyrightNotice ?fotograaf }
  FILTER(!CONTAINS(?naam, "(naam onbekend)"))
}
ORDER BY ?naam
LIMIT 20"""),
]

ZEELAND = [
    intro("Zeeuwse cultuurhistorie als linked data",
          "Deze notebook bevraagt vijf datasets van de Provincie Zeeland: dijken, dammen en wallen; polders per bedijkingsperiode; geschenkwoningen na 1953; verdronken dorpen; en de Deltawerken. Gemeenten zijn gedeelde knopen (een gesloten set, zonder provincie), zodat polders, dorpen en woningen in dezelfde gemeente bij elkaar komen.",
          ZLD),
    ("md", "## 1. Dijken naar oorspronkelijke functie"),
    ("q", """SELECT ?functie (COUNT(?d) AS ?dijken) WHERE {
  ?d schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:dike-original-function> ; schema:name ?functie .
}
GROUP BY ?functie
ORDER BY DESC(?dijken)
LIMIT 20""", ["zeeland-dikes.ttl"]),
    ("md", "## 2. Dijken naar status"),
    ("q", """SELECT ?status (COUNT(?d) AS ?dijken) WHERE {
  ?d schema:isPartOf <urn:drogevoeten:dataset:zeeland-dikes> ; schema:creativeWorkStatus/schema:name ?status .
}
GROUP BY ?status
ORDER BY DESC(?dijken)""", ["zeeland-dikes.ttl"]),
    ("md", "## 3. De oudste dijken\n\nDe aanleg is meestal een periode (begin, eind en indicatiejaar); de tekst staat in `dv:dateText`."),
    ("q", """SELECT ?naam ?aanleg ?polder WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:construction> ;
     schema:about ?d ;
     schema:startDate ?begin ;
     dv:dateText ?aanleg .
  ?d schema:isPartOf <urn:drogevoeten:dataset:zeeland-dikes> ; schema:name ?naam .
  OPTIONAL { ?d dv:inPolder/schema:name ?polder }
}
ORDER BY ?begin
LIMIT 15""", ["zeeland-dikes.ttl"]),
    ("md", "## 4. Polders met de meeste dijken\n\nDe polder bij een dijk is een gedeelde plaats (`place:polder:zeeland:…`)."),
    ("q", """SELECT ?polder (COUNT(?d) AS ?dijken) WHERE {
  ?d dv:inPolder/schema:name ?polder .
}
GROUP BY ?polder
ORDER BY DESC(?dijken)
LIMIT 15""", ["zeeland-dikes.ttl"]),
    ("md", "## 5. Indijkingen per eeuw\n\nPolders zonder eigen datering krijgen de periode van hun kaartlaag; dat staat in de jaartekst."),
    ("q", """SELECT ?eeuw (COUNT(?e) AS ?polders) (SUM(?vanLaag) AS ?alleenPeriodeVanLaag) WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:embankment> ; dv:dateText ?tekst .
  OPTIONAL { ?e schema:startDate ?s } OPTIONAL { ?e schema:endDate ?eind }
  BIND(xsd:integer(SUBSTR(STR(COALESCE(?s, ?eind)), 1, 4)) AS ?jaar)
  BIND(xsd:integer(FLOOR(?jaar / 100)) + 1 AS ?eeuw)
  BIND(IF(CONTAINS(?tekst, "periode van de kaartlaag"), 1, 0) AS ?vanLaag)
}
GROUP BY ?eeuw
ORDER BY ?eeuw""", ["zeeland-polders.ttl"]),
    ("md", "## 6. Polders met hun rapport\n\nElk rapport is een `schema:DigitalDocument` waarnaar de polder wijst met `schema:subjectOf`."),
    ("q", """SELECT ?polder ?indijking ?gemeente ?rapport WHERE {
  ?p schema:isPartOf <urn:drogevoeten:dataset:zeeland-polders> ; schema:name ?polder ; schema:subjectOf/schema:url ?rapport .
  OPTIONAL { ?p schema:containedInPlace/schema:name ?gemeente }
  OPTIONAL { ?e schema:about ?p ; dv:dateText ?indijking }
}
ORDER BY ?polder
LIMIT 20""", ["zeeland-polders.ttl"]),
    ("md", "## 7. Geschenkwoningen per land van herkomst\n\nHet land is een gedeelde plaats uit een gesloten set (`place:country:…`)."),
    ("q", """SELECT ?land (COUNT(?w) AS ?woningen) WHERE {
  ?w dv:donatedBy/schema:name ?land .
}
GROUP BY ?land
ORDER BY DESC(?woningen)""", ["gift-houses-1953.ttl"]),
    ("md", "## 8. Geschenkwoningen: bouwvorm per land\n\n\"Vrijstaand. Zomerwoning\" is bij de omzetting gesplitst in twee bouwvormen."),
    ("q", """SELECT ?land ?bouwvorm (COUNT(?w) AS ?woningen) WHERE {
  ?w dv:donatedBy/schema:name ?land ;
     dv:houseForm/schema:name ?bouwvorm .
}
GROUP BY ?land ?bouwvorm
ORDER BY ?land DESC(?woningen)""", ["gift-houses-1953.ttl"]),
    ("md", "## 9. Verdronken dorpen: wanneer?\n\nDe periode van verdrinken zoals in de bron, met de zekerheid."),
    ("q", """SELECT ?dorp ?periode ?zekerheid ?gemeente WHERE {
  ?e schema:additionalType <urn:drogevoeten:term:event-type:drowning> ;
     schema:about ?d ;
     dv:dateText ?periode ;
     dv:datePrecision ?zekerheid .
  ?d schema:name ?dorp .
  OPTIONAL { ?d schema:containedInPlace/schema:name ?gemeente }
  OPTIONAL { ?e schema:startDate ?s }
}
ORDER BY ?s
LIMIT 25""", ["drowned-villages.ttl"]),
    ("md", "## 10. De Deltawerken"),
    ("q", """SELECT ?naam ?gebouwd ?aanleg ?gemeente WHERE {
  ?d schema:isPartOf <urn:drogevoeten:dataset:delta-works> ; schema:name ?naam .
  OPTIONAL { ?d schema:dateCreated ?gebouwd }
  OPTIONAL { ?e schema:about ?d ; dv:dateText ?aanleg }
  OPTIONAL { ?d schema:locationCreated/schema:containedInPlace/schema:name ?gemeente }
}
ORDER BY COALESCE(STR(?gebouwd), ?aanleg)""", ["delta-works.ttl"]),
    ("md", "## 11. Eén gemeente, vier datasets\n\nPer gemeente: polders, verdronken dorpen, geschenkwoningen en Deltawerken. Dit werkt omdat de gemeente in alle datasets dezelfde gedeelde knoop is."),
    ("q", """SELECT ?gemeente (COUNT(DISTINCT ?polder) AS ?polders) (COUNT(DISTINCT ?dorp) AS ?verdronkenDorpen) (COUNT(DISTINCT ?woning) AS ?geschenkwoningen) (COUNT(DISTINCT ?werk) AS ?deltawerken) WHERE {
  ?g schema:name ?gemeente .
  FILTER(STRSTARTS(STR(?g), "urn:drogevoeten:place:municipality:"))
  OPTIONAL { ?polder schema:isPartOf <urn:drogevoeten:dataset:zeeland-polders> ; schema:containedInPlace ?g }
  OPTIONAL { ?dorp schema:isPartOf <urn:drogevoeten:dataset:drowned-villages> ; schema:containedInPlace ?g }
  OPTIONAL { ?woning schema:isPartOf <urn:drogevoeten:dataset:gift-houses-1953> ; schema:locationCreated/schema:containedInPlace/schema:containedInPlace ?g }
  OPTIONAL { ?werk schema:isPartOf <urn:drogevoeten:dataset:delta-works> ; schema:locationCreated/schema:containedInPlace ?g }
}
GROUP BY ?gemeente
ORDER BY DESC(?polders)"""),
]

WB = ["water-board-pumping-stations.ttl", "water-board-locks.ttl"]
WATER_BOARDS = [
    intro("Kunstwerken van de waterschappen (IMWA) als linked data",
          "Deze notebook bevraagt het open register van de waterschappen (IMWA, via PDOK), omgezet in drie datasets: gemalen, sluizen en stuwen. De waterbeheerder is een gedeelde organisatie (`org:water-board:…`). De stuwen zijn groot (53.137 records); alleen query 3 gebruikt ze.",
          WB + ["water-board-weirs.ttl"]),
    ("md", "## 1. Gemalen en sluizen per waterschap"),
    ("q", """SELECT ?waterschap (COUNT(DISTINCT ?g) AS ?gemalen) (COUNT(DISTINCT ?s) AS ?sluizen) WHERE {
  ?k schema:maintainer ?w .
  ?w schema:name ?waterschap .
  OPTIONAL { ?k schema:additionalType <urn:drogevoeten:term:object-type:pumping-station> . BIND(?k AS ?g) }
  OPTIONAL { ?k schema:additionalType <urn:drogevoeten:term:object-type:lock> . BIND(?k AS ?s) }
}
GROUP BY ?waterschap
ORDER BY DESC(?gemalen)""", WB),
    ("md", "## 2. Gemalen naar functie"),
    ("q", """SELECT ?functie (COUNT(?g) AS ?gemalen) WHERE {
  ?g schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:imwa-function> ; schema:name ?functie .
}
GROUP BY ?functie
ORDER BY DESC(?gemalen)""", ["water-board-pumping-stations.ttl"]),
    ("md", "## 3. Stuwen per waterschap"),
    ("q", """SELECT ?waterschap (COUNT(?s) AS ?stuwen) WHERE {
  ?s schema:maintainer/schema:name ?waterschap .
}
GROUP BY ?waterschap
ORDER BY DESC(?stuwen)""", ["water-board-weirs.ttl"]),
    ("md", "## 4. Hoeveel kunstwerken hebben een naam?\n\nIMWA laat de naam vaak leeg of vult \"NVT\" in; die records hebben een opgebouwde naam met \"(naam onbekend)\"."),
    ("q", """SELECT ?dataset (COUNT(?k) AS ?totaal) (SUM(?onbekend) AS ?zonderNaam) WHERE {
  ?k schema:isPartOf/schema:name ?dataset ; schema:name ?naam .
  FILTER(LANG(?naam) = "nl")
  BIND(IF(CONTAINS(?naam, "(naam onbekend)"), 1, 0) AS ?onbekend)
}
GROUP BY ?dataset""", WB),
    ("md", "## 5. Eén objectsoort in twee bronnen\n\nDe historische gemalen (RCE, Gemalen Stichting) en de gemalen van nu (IMWA) delen onze objectsoort `object-type:pumping-station`. Het zijn nog losse records; de koppeling (naam + afstand) volgt in fase 2."),
    ("q", """SELECT ?dataset (COUNT(?g) AS ?gemalen) WHERE {
  ?g schema:additionalType <urn:drogevoeten:term:object-type:pumping-station> ;
     schema:isPartOf/schema:name ?dataset .
}
GROUP BY ?dataset""", ["water-board-pumping-stations.ttl", "pumping-stations.ttl"]),
    ("md", "## 6. Gemalen van nu in de buurt van de Abdij in Middelburg\n\nDe tien dichtstbijzijnde, gesorteerd op afstand (een benadering in km²)."),
    ("q", """SELECT ?naam ?waterschap ?lat ?lon WHERE {
  ?g schema:additionalType <urn:drogevoeten:term:object-type:pumping-station> ;
     schema:name ?naam ;
     schema:maintainer/schema:name ?waterschap ;
     schema:locationCreated/schema:geo ?geo .
  ?geo schema:latitude ?lat ; schema:longitude ?lon .
  BIND((?lat - 51.4988) * 111.2 AS ?dy)
  BIND((?lon - 3.6136) * 69.3 AS ?dx)
  BIND(?dx * ?dx + ?dy * ?dy AS ?km2)
}
ORDER BY ?km2
LIMIT 10""", ["water-board-pumping-stations.ttl"]),
]

NOTEBOOKS = [
    ("windmills.sparqlbook", ["windmills.ttl", "lost-windmills.ttl"], WINDMILLS),
    ("drained-lakes.sparqlbook", ["drained-lakes.ttl"], DRAINED_LAKES),
    ("land-consolidation.sparqlbook", ["land-consolidation.ttl"], LAND_CONSOLIDATION),
    ("breach-pools.sparqlbook", ["breach-pools.ttl"], BREACH_POOLS),
    ("zeeland.sparqlbook", ZLD, ZEELAND),
    ("water-boards.sparqlbook", WB, WATER_BOARDS),
]

SC = ["concept-merges.ttl", "pumping-stations.ttl", "windmills.ttl", "lost-windmills.ttl", "drained-lakes.ttl",
      "breach-pools.ttl", "zeeland-dikes.ttl", "zeeland-polders.ttl", "gift-houses-1953.ttl"]
SHARED = [
    intro("Gedeelde termen en plaatsen over de datasets heen",
          "Deze notebook laat zien wat het samenvoegen oplevert: termen, woonplaatsen en gebieden die in meer dan één dataset voorkomen, zijn één knoop. Waar dat door samenvoegen komt, staat in `build/concept-merges.ttl` (`dct:replaces`, met de regel in `rdfs:comment`). Het complete gecombineerde bestand (`build/droge-voeten.ttl`) is te groot om hier per query te laden; de losse datasets gebruiken dezelfde gedeelde knopen, dus deze queries combineren ze.",
          SC),
    ("md", "## 1. Wat is er samengevoegd?\n\nAantal samengevoegde knopen per soort gedeelde knoop."),
    ("q", """SELECT ?soort (COUNT(DISTINCT ?nieuw) AS ?gedeeldeKnopen) (COUNT(?oud) AS ?opgegaan) WHERE {
  ?nieuw <http://purl.org/dc/terms/replaces> ?oud .
  BIND(REPLACE(STR(?nieuw), "^urn:drogevoeten:([a-z]+:[a-z-]+).*$", "$1") AS ?soort)
}
GROUP BY ?soort
ORDER BY DESC(?opgegaan)""", ["concept-merges.ttl"]),
    ("md", "## 2. Eén term, meerdere termensets: poldermolen\n\n\"poldermolen\" kwam voor als molenfunctie, als hoofdcategorie en als soort maalinrichting. Nu is het één term, die in alle drie de termensets zit."),
    ("q", """SELECT ?termenset ?dataset (COUNT(DISTINCT ?r) AS ?records) WHERE {
  <urn:drogevoeten:term:drainage-structure:poldermolen> schema:inDefinedTermSet/schema:name ?termenset .
  FILTER(LANG(?termenset) = "nl")
  ?r schema:additionalType <urn:drogevoeten:term:drainage-structure:poldermolen> ;
     schema:isPartOf/schema:name ?dataset .
}
GROUP BY ?termenset ?dataset
ORDER BY ?dataset ?termenset""", ["windmills.ttl", "lost-windmills.ttl", "drained-lakes.ttl"]),
    ("md", "## 3. Termen die in meer dan één dataset gebruikt worden"),
    ("q", """SELECT ?term (COUNT(DISTINCT ?d) AS ?datasets) (COUNT(DISTINCT ?r) AS ?records) WHERE {
  ?t a schema:DefinedTerm ; schema:name ?term .
  FILTER(LANG(?term) = "nl")
  FILTER(!STRSTARTS(STR(?t), "urn:drogevoeten:term:event-type:"))
  ?r ?p ?t ; schema:isPartOf ?d .
}
GROUP BY ?term
HAVING (COUNT(DISTINCT ?d) > 1)
ORDER BY DESC(?datasets) DESC(?records)
LIMIT 25"""),
    ("md", "## 4. Woonplaatsen in meer dan één dataset\n\nMolens en wielen hebben geen provincie in de bron; hun woonplaats is samengevoegd met dezelfde woonplaats mét provincie (bijv. van de gemalen) als de records binnen 10 km van elkaar liggen."),
    ("q", """SELECT ?woonplaats ?provincie (COUNT(DISTINCT ?d) AS ?datasets) (GROUP_CONCAT(DISTINCT ?ds; separator=", ") AS ?welke) WHERE {
  ?w schema:name ?woonplaats .
  FILTER(STRSTARTS(STR(?w), "urn:drogevoeten:place:locality:"))
  OPTIONAL { ?w schema:containedInPlace+ ?pv . ?pv schema:name ?provincie FILTER(STRSTARTS(STR(?pv), "urn:drogevoeten:place:province:")) }
  { ?x schema:containedInPlace ?w . ?r schema:locationCreated ?x } UNION { ?r schema:containedInPlace ?w }
  ?r schema:isPartOf ?d .
  BIND(STRAFTER(STR(?d), "dataset:") AS ?ds)
}
GROUP BY ?woonplaats ?provincie
HAVING (COUNT(DISTINCT ?d) > 2)
ORDER BY DESC(?datasets) ?woonplaats
LIMIT 25""", ["pumping-stations.ttl", "windmills.ttl", "breach-pools.ttl", "lost-windmills.ttl", "gift-houses-1953.ttl"]),
    ("md", "## 5. Een polder bij een dijk is het polderrecord\n\nDe polder die de dijkenlaag noemt, is samengevoegd met het record uit de polderdataset (zelfde naam, dijk in of bij de polder). Zo komen de dijken en de indijking van de polder bij elkaar."),
    ("q", """SELECT ?polder ?indijking (COUNT(DISTINCT ?dijk) AS ?dijken) WHERE {
  ?p schema:isPartOf <urn:drogevoeten:dataset:zeeland-polders> ; schema:name ?polder .
  ?dijk dv:inPolder ?p .
  OPTIONAL { ?e schema:about ?p ; dv:dateText ?indijking }
}
GROUP BY ?polder ?indijking
ORDER BY DESC(?dijken)
LIMIT 20""", ["zeeland-dikes.ttl", "zeeland-polders.ttl"]),
    ("md", "## 6. Gemalen die een droogmakerij bemalen\n\nHet bemalingsgebied van een gemaal is samengevoegd met de droogmakerij met dezelfde naam als het gemaal erin of erbij ligt."),
    ("q", """SELECT ?droogmakerij ?drooggemaakt (GROUP_CONCAT(DISTINCT ?gemaal; separator=", ") AS ?gemalen) WHERE {
  ?d schema:isPartOf <urn:drogevoeten:dataset:drained-lakes> ; schema:name ?droogmakerij .
  ?g dv:drainsArea ?d ; schema:name ?gemaal .
  OPTIONAL { ?e schema:about ?d ; dv:dateText ?drooggemaakt }
}
GROUP BY ?droogmakerij ?drooggemaakt
ORDER BY ?droogmakerij
LIMIT 25""", ["pumping-stations.ttl", "drained-lakes.ttl"]),
    ("md", "## 7. Waar komt een gedeelde knoop vandaan?\n\nDe linkset `concept-merges` noemt per gedeelde knoop de knopen die erin zijn opgegaan, met de regel."),
    ("q", """SELECT ?gedeeld ?naam ?toelichting WHERE {
  ?gedeeld <http://purl.org/dc/terms/replaces> ?oud ;
           schema:name ?naam ;
           rdfs:comment ?toelichting .
  FILTER(STRSTARTS(STR(?gedeeld), "urn:drogevoeten:term:"))
}
GROUP BY ?gedeeld ?naam ?toelichting
ORDER BY ?gedeeld
LIMIT 25""", ["concept-merges.ttl"]),
]
NOTEBOOKS.append(("shared-concepts.sparqlbook", SC, SHARED))


def _rq(name):
    """A query from queries/ without its own PREFIX lines (make_sparqlbook adds the shared prefixes)."""
    import os
    text = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "queries", name), encoding="utf-8").read()
    return "\n".join(line for line in text.splitlines() if not line.startswith("PREFIX ")).strip()


TL_POLDER = ["zeeland-polders.ttl", "drained-lakes.ttl"]
TIMELINE = [
    ("md", """# Tijdlijn per adres

Drie queries voor de tijdlijn "Hoe werd dit droog?", elk op een paar kleine datasets, zodat ze in een fractie van een seconde antwoorden. Ze staan ook als losse bestanden in `queries/timeline-*.rq`; een app vervangt alleen de `VALUES`-regel door de coördinaten van het adres. Hier: **Abdij 4, Middelburg** (de HackaLOD-locatie).

**Eerst:** draai `make` in `linkeddata/`.

- Ruimtelijk werkt met GeoSPARQL-functies (`geof:sfContains`, `geof:sfIntersects`), die Oxigraph kent. `geof:distance` kent het niet; daarom een vierkant rond het adres en afstanden in klassen.
- De links helpen: `bemaaltDezePolder` en `vanDezePolder` zijn `true` als het gemaal of de dijk volgens de bron bij de polder van dit adres hoort (via de samengevoegde polderknoop, DECISIONS §29)."""),
    ("md", "## 1. Wanneer werd deze plek polder?\n\nDe indijking (Zeeuwse polders) of droogmaking (droogmakerijen) van het gebied waarin het adres ligt."),
    ("q", _rq("timeline-polder.rq"), TL_POLDER),
    ("md", "## 2. Wanneer zijn de gemalen in de buurt gesticht?\n\nGemalen binnen ca. 3 km, van dichtbij naar ver."),
    ("q", _rq("timeline-gemalen.rq"), ["pumping-stations.ttl"] + TL_POLDER),
    ("md", "## 3. Wanneer zijn de dijken in de buurt aangelegd?\n\nDijken die een vierkant van ca. 250 m rond het adres raken (alleen Zeeland)."),
    ("q", _rq("timeline-dijken.rq"), ["zeeland-dikes.ttl", "zeeland-polders.ttl"]),
]
NOTEBOOKS.append(("timeline.sparqlbook", TL_POLDER, TIMELINE))
