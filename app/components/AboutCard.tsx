import { useEffect } from "react";
import { Icon } from "./Icons";

/* Card with the story behind the data: which sources we use, how they are
   linked, and what is still a placeholder. Opens from the info button. */
export function AboutCard({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div id="about" onClick={onClose}>
      <div className="card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <Icon name="close" />
        </button>
        <h2 id="aboutTitle">
          <Icon name="info" />
          Waar komt dit vandaan?
        </h2>
        <p className="lead">Alles wat je hier ziet komt uit open data. Elk feit heeft een bron. Weten we iets niet, dan zeggen we dat.</p>

        <h3>Hoe het werkt</h3>
        <p>
          Je typt een adres. Wij zoeken op welk stuk land dat ligt, hoe hoog het ligt en welk gemaal het droog houdt. Die gegevens
          staan bij verschillende organisaties. Ze zijn aan elkaar gekoppeld als linked data, zodat de computer ze bij elkaar kan
          zoeken.
        </p>

        <h3>Bronnen</h3>
        <ul>
          <li>Hoogte van de vloer: Actueel Hoogtebestand Nederland (AHN).</li>
          <li>Gemalen, sluizen en peilgebieden: waterschapsregister (IMWA).</li>
          <li>Regen: KNMI, weerstation Vlissingen.</li>
          <li>Kaart en adressen: PDOK.</li>
          <li>Beelden: Rijksmuseum en RCE beeldbank, via IIIF.</li>
          <li>Molens: Molendatabase.</li>
        </ul>

        <h3>Nog niet echt</h3>
        <p>
          De waterhoogte bij een dijkbreuk is een rekensom, geen voorspelling. De tekst per adres en een paar beelden zijn nog
          placeholders. Dit is gebouwd tijdens HackaLOD 2026.
        </p>
      </div>
    </div>
  );
}
