import { Tip } from "./Tip";

/* Hand-drawn map of the Netherlands with a pin. Placeholder: the real map
   should come from PDOK, with the pin on real coordinates. */

/* Pin positions in svg units for the four places the prototype knows. */
export const PLACES: Record<string, [number, number]> = {
  middelburg: [26.6, 254.4],
  beemster: [123.4, 128.4],
  nieuwerkerk: [55.4, 236.4],
  lemmer: [181.7, 93.6],
};

export function placeKeyFor(address: string): string {
  const a = address.toLowerCase();
  return Object.keys(PLACES).find((k) => a.includes(k)) ?? "middelburg";
}

export function NlMap({ address }: { address: string }) {
  const [x, y] = PLACES[placeKeyFor(address)];
  return (
    <section className="panel" id="p-map">
      <span className="meta">nederland</span>
      <h2>Hier woon jij</h2>
      <svg className="nl" viewBox="-6 -6 312 362" aria-label="Kaart van Nederland met jouw straat" role="img"><path d="M15.6 265.2 Q8.9 270.0 14.8 274.8 Q20.7 279.6 32.5 284.4 Q44.3 289.2 59.1 279.6 Q73.9 270.0 79.5 270.6 Q85.0 271.2 94.2 267.6 Q103.4 264.0 110.8 264.0 Q118.2 264.0 124.8 260.4 Q131.5 256.8 134.1 259.8 Q136.7 262.8 141.8 270.0 Q147.0 277.2 156.6 278.4 Q166.2 279.6 172.5 286.2 Q178.8 292.8 185.4 294.6 Q192.1 296.4 188.4 308.4 Q184.7 320.4 181.0 325.8 Q177.3 331.2 179.2 337.2 Q181.0 343.2 192.8 343.8 Q204.6 344.4 207.2 334.2 Q209.8 324.0 201.7 316.2 Q193.6 308.4 204.6 302.4 Q215.7 296.4 212.4 291.6 Q209.1 286.8 214.2 276.6 Q219.4 266.4 209.4 245.4 Q199.5 224.4 216.1 219.6 Q232.7 214.8 244.5 210.6 Q256.4 206.4 260.4 200.4 Q264.5 194.4 273.0 180.6 Q281.5 166.8 280.4 156.6 Q279.3 146.4 267.1 141.0 Q254.9 135.6 256.8 126.0 Q258.6 116.4 269.6 116.4 Q280.7 116.4 286.6 95.4 Q292.6 74.4 292.6 60.0 Q292.6 45.6 281.1 39.0 Q269.7 32.4 243.8 28.8 Q217.9 25.2 206.9 27.0 Q195.8 28.8 182.9 34.8 Q169.9 40.8 164.4 51.6 Q158.8 62.4 156.9 71.4 Q155.1 80.4 144.1 81.0 Q133.0 81.6 121.9 80.4 Q110.8 79.2 105.2 100.8 Q99.7 122.4 96.0 140.4 Q92.3 158.4 83.1 170.4 Q73.9 182.4 66.5 189.6 Q59.1 196.8 51.7 205.8 Q44.3 214.8 38.8 222.6 Q33.2 230.4 25.9 236.4 Q18.5 242.4 16.6 248.4 Q14.8 254.4 18.5 257.4 Q22.2 260.4 15.6 265.2 Z" fill="#fff" stroke="#242424" strokeWidth="3" strokeLinejoin="round"/><path d="M133.0 93.6 Q133.0 82.8 145.9 83.4 Q158.8 84.0 166.2 88.2 Q173.6 92.4 171.8 101.4 Q169.9 110.4 160.7 115.2 Q151.5 120.0 144.1 118.2 Q136.7 116.4 134.8 110.4 Q133.0 104.4 133.0 93.6 Z" fill="#5fb4ec" stroke="#242424" strokeWidth="1.5" strokeLinejoin="round"/><path d="M133.0 133.2 Q133.0 122.4 144.1 125.4 Q155.1 128.4 153.3 138.6 Q151.5 148.8 142.2 146.4 Q133.0 144.0 133.0 133.2 Z" fill="#5fb4ec" stroke="#242424" strokeWidth="1.5" strokeLinejoin="round"/><path d="M20.7 260.4 Q18.5 262.8 29.6 265.8 Q40.6 268.8 55.4 269.4 Q70.2 270.0 71.0 266.4 Q71.7 262.8 56.2 261.0 Q40.6 259.2 31.8 258.6 Q22.9 258.0 20.7 260.4 Z" fill="#5fb4ec" stroke="#242424" strokeWidth="1.5" strokeLinejoin="round"/><path d="M34.8 237.0 Q31.8 240.0 43.6 244.2 Q55.4 248.4 62.8 251.4 Q70.2 254.4 67.2 248.4 Q64.3 242.4 51.0 238.2 Q37.7 234.0 34.8 237.0 Z" fill="#5fb4ec" stroke="#242424" strokeWidth="1.5" strokeLinejoin="round"/><ellipse cx="114.5" cy="64.8" rx="10" ry="4" transform="rotate(-55 114.5 64.8)" fill="#fff" stroke="#242424" strokeWidth="2"/><ellipse cx="133.0" cy="40.8" rx="9" ry="2.4" transform="rotate(-30 133.0 40.8)" fill="#fff" stroke="#242424" strokeWidth="2"/><ellipse cx="151.5" cy="26.4" rx="11" ry="2.6" transform="rotate(-15 151.5 26.4)" fill="#fff" stroke="#242424" strokeWidth="2"/><ellipse cx="184.7" cy="20.4" rx="9" ry="2.4" transform="rotate(-5 184.7 20.4)" fill="#fff" stroke="#242424" strokeWidth="2"/><ellipse cx="217.9" cy="15.6" rx="6" ry="2" transform="rotate(0 217.9 15.6)" fill="#fff" stroke="#242424" strokeWidth="2"/><text x="24" y="120" className="zee">NOORDZEE</text><g id="mapPin" transform={`translate(${x} ${y})`}><circle className="ping" r="9" fill="none" stroke="#FFA654" strokeWidth="3"/><circle r="7" fill="#FFA654" stroke="#242424" strokeWidth="2.5"/></g></svg>
      <p className="kaartcap">
        Een kwart van Nederland ligt lager dan de zee.{" "}
        <Tip kind="bron" tip="Planbureau voor de Leefomgeving, 2010: 26 procent van Nederland ligt onder zeeniveau, 59 procent kan overstromen.">bron</Tip>
      </p>
    </section>
  );
}
