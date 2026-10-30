/* Short explainer next to the green "Gemalen" panel. The text is a summary
   of the Dutch Wikipedia article on gemalen. */
export function GemaalPanel() {
  return (
    <section className="panel" id="p-gemaal">
      <span className="meta">uitleg</span>
      <h2>Wat is een gemaal?</h2>
      <p>
        Een gemaal pompt water van een laag naar een hoger niveau. Zo blijft het waterpeil in een gebied op de goede hoogte. Meestal gaat het om
        overtollig water uit een polder.
      </p>
      <p>
        Elk gemaal heeft twee onderdelen: een werktuig dat het water optilt, zoals een vijzel, scheprad of pomp, en een aandrijving die dat werktuig
        laat draaien.
      </p>
      <p>
        Vanaf de 15e eeuw deed de wind dat werk, via een poldermolen. Vanaf 1850 kwam de stoommachine, na 1900 de dieselmotor en de elektromotor.
        Nieuwe gemalen na 1965 draaien meestal op elektriciteit.
      </p>
      <a className="src-link" href="https://nl.wikipedia.org/wiki/Gemaal_(waterbouwkunde)" target="_blank" rel="noreferrer">
        Bron: Wikipedia
      </a>
    </section>
  );
}
