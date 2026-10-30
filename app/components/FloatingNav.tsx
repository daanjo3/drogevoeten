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
}: {
  active: SectionKey;
  mode: Mode;
  onGo: (t: NavTarget) => void;
  onBack: () => void;
}) {
  const isCurrent = (t: NavTarget) => active === t.key && (!t.mode || t.mode === mode);

  const Btn = ({ t, icon, title, label, className }: { t: NavTarget; icon: Parameters<typeof Icon>[0]["name"]; title: string; label: string; className?: string }) => (
    <button type="button" className={className} aria-current={isCurrent(t)} onClick={() => onGo(t)}>
      <Icon name={icon} />
      <span>
        <span className="t">{title}</span>
        <span className="l">{label}</span>
      </span>
    </button>
  );

  return (
    <nav id="nav" aria-label="Navigatie">
      <button type="button" id="back" onClick={onBack}>
        <Icon name="terug" />
        <span>
          <span className="t">Begin</span>
          <span className="l">ander adres</span>
        </span>
      </button>
      <span className="sep" />
      <Btn t={{ key: "huis", mode: "info" }} icon="huis" title="Huiskamer" label="hoe diep woon je?" />
      <Btn t={{ key: "tijd" }} icon="tijd" title="Tijdreis" label="hoe werd het droog?" />
      <Btn t={{ key: "buurt" }} icon="buurt" title="Buurt" label="wie pompt hier?" />
      <span className="sep" />
      <Btn t={{ key: "huis", mode: "risk" }} icon="drop" title="Als het misgaat" label="speel met regen en dijk" className="risk" />
    </nav>
  );
}
