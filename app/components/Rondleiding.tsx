import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { nl } from "../lib/scenario";

/* The tour after a search: one story card floating over the grid. Every
   step scrolls the grid to a block (the page does that, see onChange) and
   lights up the menu button that belongs to it. */

export interface TourData {
  /* ground level at the address in m NAP (AHN); undefined while unknown */
  nap?: number;
  /* when and how this land came to be (linked data); undefined when unknown */
  drained?: { when: string; kind: string };
}

type NavButton = "huis" | "tijd" | "buurt" | "risk";
type IconName = Parameters<typeof Icon>[0]["name"];

export const TOUR_STEPS = 5;

/* the menu button each step lights up; step 1 has none */
export const TOUR_BUTTONS: (NavButton | undefined)[] = [undefined, "huis", "tijd", "buurt", "risk"];

/* on phones the menu is hidden during the tour, so the button shows in the text */
const CHIPS: Record<NavButton, { icon: IconName; label: string }> = {
  huis: { icon: "huis", label: "Huiskamer" },
  tijd: { icon: "tijd", label: "Tijdreis" },
  buurt: { icon: "buurt", label: "Gemalen" },
  risk: { icon: "drop", label: "Als het misgaat" },
};

/* Only what the data says: a missing height or year leaves its sentence out. */
function textFor(step: number, d: TourData): string {
  switch (step) {
    case 0: {
      const out: string[] = [];
      if (d.nap !== undefined) {
        const m = Math.round(Math.abs(d.nap) * 10) / 10;
        out.push(m === 0 ? "Je woont precies op zeeniveau." : `Je woont ${nl(m)} meter ${d.nap >= 0 ? "boven" : "onder"} zeeniveau.`);
      }
      out.push("Een kwart van Nederland ligt onder zeeniveau.");
      return out.join(" ");
    }
    case 1:
      return "Dit is jouw huiskamer. Met de knop Huiskamer kom je hier altijd terug.";
    case 2:
      return (
        "Dat je hier droog zit, gaat niet vanzelf. Al eeuwen houden dijken, molens en gemalen het water buiten." +
        (d.drained ? ` Hier werd het land ${d.drained.when} ${d.drained.kind === "indijking" ? "ingedijkt" : "droog gemaakt"}.` : "")
      );
    case 3:
      return "Dit zijn de gemalen bij jou in de buurt. Ze pompen elke dag het water weg, zodat jij droge voeten houdt.";
    default:
      return "Wat als de dijk breekt, het gemaal stopt of het heel hard regent? Druk op Als het misgaat en kijk hoe hoog het water in je huiskamer komt.";
  }
}

export function Rondleiding({
  data,
  paused,
  onChange,
  onEnd,
}: {
  data: TourData;
  /* true while another dialog (Over) is open: the keys are left alone */
  paused: boolean;
  /* a step is on screen; inset is the height the card covers at the bottom */
  onChange: (step: number, inset: number) => void;
  /* "skip" for Overslaan, "try" for the last button (Zelf proberen) */
  onEnd: (how: "skip" | "try") => void;
}) {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const last = step === TOUR_STEPS - 1;
  const button = TOUR_BUTTONS[step];

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* after each step: tell the page, and put focus on Verder */
  useLayoutEffect(() => {
    const r = card.current?.getBoundingClientRect();
    onChangeRef.current(step, r ? Math.max(0, window.innerHeight - r.top) : 0);
    nextBtn.current?.focus({ preventScroll: true });
  }, [step]);

  function advance() {
    if (last) {
      onEnd("try");
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep((s) => s + 1);
      return;
    }
    if (fading) return;
    /* text and card fade out, then the next step fades in */
    setFading(true);
    timer.current = window.setTimeout(() => {
      setStep((s) => s + 1);
      setFading(false);
    }, 300);
  }
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /* Escape skips; Enter goes on unless a button or link has focus (it then does its own thing) */
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEnd("skip");
      } else if (e.key === "Enter") {
        const el = document.activeElement;
        if (!el || el === document.body) advanceRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paused, onEnd]);

  return (
    <div id="tour" ref={card} className={fading ? "fading" : undefined} role="region" aria-label="Rondleiding">
      <div className="body" aria-live="polite">
        <span className="count">
          Stap {step + 1} van {TOUR_STEPS}
        </span>
        <div className="dots" aria-hidden="true">
          {Array.from({ length: TOUR_STEPS }, (_, i) => (
            <span key={i} className={i === step ? "on" : undefined} />
          ))}
        </div>
        {button && (
          <span className="chip">
            <Icon name={CHIPS[button].icon} />
            {CHIPS[button].label}
          </span>
        )}
        <p>{textFor(step, data)}</p>
      </div>
      <div className="acts">
        <button type="button" className="skip" onClick={() => onEnd("skip")}>
          <Icon name="close" />
          <span>Overslaan</span>
        </button>
        <button type="button" className="next" ref={nextBtn} onClick={advance}>
          {last ? "Zelf proberen" : "Verder"}
        </button>
      </div>
    </div>
  );
}
