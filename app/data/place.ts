/* Content for one address. For now this is the hardcoded Middelburg example
   from the design prototype (design/index.html). Later every field comes from
   the data layer's integration API in prototype/, nothing stays hardcoded here. */

export type Mode = "info" | "risk";

export interface TimelineStep {
  year: string;
  text: string;
  source: string;
}

export interface NearbyWork {
  name: string;
  distance: string;
  status: "werkt nu mee" | "werkte vroeger" | "onbekend";
  /* position on the neighbourhood map, in percent (placeholder) */
  x: number;
  y: number;
  text: string;
  source: string;
}

export interface PlaceData {
  address: string;
  /* floor height in m above NAP (AHN) */
  nap: number;
  /* the year the land was drained, roughly */
  drainedYear: number;
  timeline: TimelineStep[];
  nearby: NearbyWork[];
}

export const MIDDELBURG: PlaceData = {
  address: "Abdij 4, Middelburg",
  nap: 2.0,
  drainedYear: 1200,
  timeline: [
    {
      year: "Rond 1200",
      text: "Mensen bouwen een [dijk] om het land. De zee kan er niet meer bij. Dit stuk heet [polder] Walcheren.",
      source: "Bron: Provincie Zeeland (placeholder)",
    },
    {
      year: "1600",
      text: "Regen blijft in de polder staan. Molens draaien op de wind en pompen het water over de dijk.",
      source: "Bron: Molendatabase (placeholder)",
    },
    {
      year: "1929",
      text: "Er komt een [gemaal], een pomp met een motor. Gemaal Boreel. Het doet het werk van veel molens tegelijk.",
      source: "Bron: Gemalenstichting",
    },
    {
      year: "1953",
      text: "Een zware storm. Bij veel dorpen in Zeeland breekt de dijk. Hier in Middelburg blijft het droog.",
      source: "Bron: Rijkswaterstaat, Vlissingen",
    },
    {
      year: "Nu",
      text: "Gemaal Boreel draait nog steeds. Waterschap Scheldestromen let erop, dag en nacht.",
      source: "Bron: waterschapsregister",
    },
  ],
  nearby: [
    {
      name: "Gemaal Boreel",
      distance: "1,1 km",
      status: "werkt nu mee",
      x: 65,
      y: 25,
      text: "Dit gemaal pompt elke dag water uit jouw polder. Het is gebouwd in 1929 en draait nog steeds.",
      source: "waterschapsregister · Gemalenstichting",
    },
    {
      name: "Spuisluis bij de Stadsschuur",
      distance: "0,6 km",
      status: "werkt nu mee",
      x: 30,
      y: 30,
      text: "Een [sluis] die water doorlaat als het nodig is. Staat in het register van het waterschap.",
      source: "waterschapsregister",
    },
    {
      name: "Molen placeholder",
      distance: "3,2 km",
      status: "werkte vroeger",
      x: 20,
      y: 72,
      text: "Deze molen pompte vroeger water weg. Nu is het een museum. Hij draait soms nog, maar niet voor de polder.",
      source: "Molendatabase",
    },
    {
      name: "Sluis Veere",
      distance: "5,8 km",
      status: "onbekend",
      x: 70,
      y: 70,
      text: "We weten niet zeker of deze sluis nog meedoet. Daar is geen bron voor gevonden.",
      source: "geen bron",
    },
  ],
};

/* Explanations for difficult words, shown in a tooltip. Words between
   [brackets] in texts are looked up here. */
export const TERMS: Record<string, string> = {
  NAP: "Normaal Amsterdams Peil. Daarmee meten we in Nederland hoe hoog iets ligt. Het is ongeveer de hoogte van de zee.",
  zeeniveau: "Ongeveer de gemiddelde hoogte van de zee. In Nederland meten we hoogte vanaf het Normaal Amsterdams Peil, kortweg NAP.",
  peilgebied: "Een stuk land waar het water in de sloten overal even hoog moet staan.",
  gemaal: "Een gebouw met grote pompen. Het pompt water uit de polder naar een kanaal, rivier of de zee.",
  waterschap: "De organisatie die zorgt voor de dijken, sloten en gemalen in een gebied.",
  dijk: "Een lange wal van aarde en klei die het water tegenhoudt.",
  polder: "Een stuk land met een dijk eromheen. Het water wordt eruit gepompt, zodat het land droog blijft.",
  poldermolen: "Een windmolen die water uit de polder pompt. Voordat er gemalen waren, deden molens dat werk.",
  poldermolens: "Windmolens die water uit de polder pompen. Voordat er gemalen waren, deden molens dat werk.",
  wiel: "Een diepe plas achter een dijk. Het water sloeg die kolk uit toen de dijk doorbrak.",
  wielen: "Diepe plassen achter een dijk. Het water sloeg die kolken uit toen de dijk doorbrak.",
  geschenkwoning: "Een huis dat een ander land gaf na de watersnoodramp van 1953.",
  geschenkwoningen: "Huizen die andere landen gaven na de watersnoodramp van 1953.",
  sluis: "Een soort deur in het water. Gaat hij open, dan kan water of een boot erdoor.",
  mm: "1 millimeter regen betekent 1 liter water op elke vierkante meter grond.",
  kans: "Hoe waarschijnlijk het is dat iets in een jaar gebeurt. Bij een kans van 1 op 300 per jaar gebeurt het gemiddeld eens in de 300 jaar. Het kan dit jaar gebeuren, of eeuwenlang niet.",
  kuub: "Een kubieke meter. Een bak van 1 bij 1 bij 1 meter. Daar past 1000 liter water in.",
};
