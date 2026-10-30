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
          Alles hier heeft een bron
        </h2>
        <p className="lead">Elk feit op deze pagina komt uit open data. Weten we iets niet, dan zeggen we dat.</p>

        <h3>Zo werkt het</h3>
        <p>
          Je typt een adres. Wij zoeken op in welke polder dat ligt, hoe hoog je vloer ligt en welk gemaal het water wegpompt. Die
          gegevens komen van verschillende organisaties. Wij hebben ze aan elkaar gekoppeld met linked data. Zo weet de computer
          dat Gemaal Boreel in het ene bestand hetzelfde gemaal is als in het andere. Wat we zelf koppelden, zetten we weer open
          online.
        </p>

        <h3>Bronnen</h3>
        <ul>
          <li>Hoogte van de vloer: Actueel Hoogtebestand Nederland (AHN)</li>
          <li>Gemalen, sluizen en peilgebieden: waterschapsregister (IMWA)</li>
          <li>Overstromingen: LIWO, Rijkswaterstaat</li>
          <li>Jaartallen van dijken en polders: Provincie Zeeland</li>
          <li>Regen: KNMI, weerstation Vlissingen</li>
          <li>Adressen: PDOK</li>
          <li>Molens: Molendatabase</li>
          <li>Beelden: Rijksmuseum en RCE beeldbank</li>
        </ul>

        <h3>Nog niet af</h3>
        <p>
          De tijd om het water weg te pompen is een rekensom met echte getallen, geen voorspelling. De waterhoogte bij een
          dijkbreuk en een paar teksten en beelden zijn nog voorbeelden. Gebouwd in 24 uur tijdens HackaLOD 2026.
        </p>
      </div>
    </div>
  );
}
