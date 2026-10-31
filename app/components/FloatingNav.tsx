import type { Mode } from "../data/place";
import { Icon } from "./Icons";
import type { SectionKey } from "./Canvas";

export interface NavTarget {
  key: SectionKey;
  mode?: Mode;
}

/* Floating navigation at the bottom. The active button follows the block
   closest to the centre of the screen; for the living room the mode counts too. */
export function FloatingNav({
  active,
  mode,
  onGo,
  onBack,
  touring = false,
  tourButton,
}: {
  active: SectionKey;
  mode: Mode;
  onGo: (t: NavTarget) => void;
  onBack: () => void;
  /* the tour is running: phones hide the menu, then */
  touring?: boolean;
  /* the button the current tour step lights up */
  tourButton?: "huis" | "tijd" | "buurt" | "risk";
}) {
  const isCurrent = (t: NavTarget) => active === t.key && (!t.mode || t.mode === mode);

  const Btn = ({ t, id, icon, title, label, className }: { t: NavTarget; id: "huis" | "tijd" | "buurt" | "risk"; icon: Parameters<typeof Icon>[0]["name"]; title: string; label: string; className?: string }) => (
    <button
      type="button"
      className={[className, tourButton === id ? "tour" : ""].filter(Boolean).join(" ") || undefined}
      aria-current={isCurrent(t)}
      onClick={() => onGo(t)}
    >
      <Icon name={icon} />
      <span>
        <span className="t">{title}</span>
        <span className="l">{label}</span>
      </span>
    </button>
  );

  return (
    <nav id="nav" aria-label="Navigatie" className={touring ? "touring" : undefined}>
      <button type="button" id="back" onClick={onBack}>
        <Icon name="terug" />
        <span>
          <span className="t">Begin</span>
          <span className="l">ander adres</span>
        </span>
      </button>
      <span className="sep" />
      <Btn t={{ key: "huis", mode: "info" }} id="huis" icon="huis" title="Huiskamer" label="hoe droog woon je?" />
      <Btn t={{ key: "tijd" }} id="tijd" icon="tijd" title="Tijdreis" label="hoe werd het droog?" />
      <Btn t={{ key: "buurt" }} id="buurt" icon="buurt" title="Gemalen" label="zij houden je droog" />
      <span className="sep" />
      <Btn t={{ key: "huis", mode: "risk" }} id="risk" icon="drop" title="Als het misgaat" label="speel met regen en dijk" className="risk" />
    </nav>
  );
}
