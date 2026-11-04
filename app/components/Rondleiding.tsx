import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import { Tip } from "./Tip";
import { TERMS } from "../data/place";
import { nl } from "../lib/scenario";

/* The tour after a search: one story card over the grid. On larger screens
   it sits at the top, so the block it talks about stays centred and free;
   on phones it is a bar at the bottom. Every step scrolls the grid to a
   block (the page does that, see onChange) and lights up the menu button
   that belongs to it. The story: your living room and how high it lies,
   how the land became dry, who keeps it dry, and what if it goes wrong. */

type NavButton = "huis" | "tijd" | "buurt" | "risk";
type IconName = Parameters<typeof Icon>[0]["name"];

export const TOUR_STEPS = 4;

/* the menu button each step lights up; step 4 also pulses Als het misgaat */
export const TOUR_BUTTONS: (NavButton | undefined)[] = ["huis", "tijd", "buurt", "huis"];
export const TOUR_PULSE: (NavButton | undefined)[] = [undefined, undefined, undefined, "risk"];

/* step 1 says how high the living room lies; nap is the ground level in m NAP, undefined while unknown */
function firstText(nap?: number): ReactNode {
  const sea = (
    <Tip kind="term" tip={TERMS.zeeniveau}>
      zeeniveau
    </Tip>
  );
  if (nap === undefined)
    return <>Dit is jouw huiskamer. Hoe blijft hij droog? Dat ontdek je in deze rondleiding.</>;
  const m = Math.round(Math.abs(nap) * 10) / 10;
  if (m === 0) return <>Dit is jouw huiskamer. Hij ligt precies op {sea}. Hoe blijft hij droog? Dat ontdek je in deze rondleiding.</>;
  if (nap < 0)
    return (
      <>
        Dit is jouw huiskamer. Hij ligt {nl(m)} meter onder {sea}. Toch heb je droge voeten. In deze rondleiding ontdek je hoe dat kan.
      </>
    );
  return (
    <>
      Dit is jouw huiskamer. Hij ligt {nl(m)} meter boven {sea}. Een kwart van Nederland ligt lager. In deze rondleiding ontdek je hoe
      dat droog blijft.
    </>
  );
}

const TEXTS: ReactNode[] = [
  null,
  "Droge voeten gaan niet vanzelf. In de tijdreis zie je wat mensen hier deden om het land droog te krijgen.",
  "Sommige gemalen pompen nog elke dag, andere zijn museum geworden. Klik op een stip om te zien welke.",
  "Wat als het water toch komt? Druk op Als het misgaat en zie hoe hoog het in je huiskamer kan staan.",
];

/* on phones the menu is hidden during the tour, so the buttons show as labels in the text */
const CHIPS: Record<NavButton, { icon: IconName; label: string }> = {
  huis: { icon: "huis", label: "Huiskamer" },
  tijd: { icon: "tijd", label: "Tijdreis" },
  buurt: { icon: "buurt", label: "Gemalen" },
  risk: { icon: "drop", label: "Als het misgaat" },
};
const STEP_CHIPS: NavButton[][] = [["huis"], ["tijd"], ["buurt"], ["huis", "risk"]];

/* the part of the screen the card covers: at the top on larger screens, at the bottom on phones */
export interface TourInset {
  top: number;
  bottom: number;
}

export function Rondleiding({
  nap,
  paused,
  onChange,
  onEnd,
}: {
  /* ground level at the address in m NAP, undefined while unknown */
  nap?: number;
  /* true while another dialog (Over) is open: the keys are left alone */
  paused: boolean;
  /* a step is on screen; inset is what the card covers at the top or bottom */
  onChange: (step: number, inset: TourInset) => void;
  /* "skip" for Rondleiding overslaan, "try" for the last button (Zelf proberen) */
  onEnd: (how: "skip" | "try") => void;
}) {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const last = step === TOUR_STEPS - 1;
  const first = step === 0;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* after each step: tell the page, and put focus on Verder */
  useLayoutEffect(() => {
    const r = card.current?.getBoundingClientRect();
    const h = window.innerHeight;
    /* with the card at the top, the menu bar still covers the bottom */
    const nav = document.getElementById("nav")?.getBoundingClientRect();
    /* larger screens: the card lies over the block on purpose, so the block stays centred */
    const inset: TourInset = !r || window.innerWidth > 900
      ? { top: 0, bottom: 0 }
      : r.top < h / 2
        ? { top: r.bottom, bottom: nav && nav.height ? Math.max(0, h - nav.top) : 0 }
        : { top: 0, bottom: Math.max(0, h - r.top) };
    onChangeRef.current(step, inset);
    nextBtn.current?.focus({ preventScroll: true });
  }, [step]);

  /* text and card fade out, then the other step fades in */
  function goTo(next: number) {
    if (next < 0 || next >= TOUR_STEPS || fading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(next);
      return;
    }
    setFading(true);
    timer.current = window.setTimeout(() => {
      setStep(next);
      setFading(false);
    }, 300);
  }
  function advance() {
    if (last) onEnd("try");
    else goTo(step + 1);
  }
  function back() {
    goTo(step - 1);
  }
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const backRef = useRef(back);
  backRef.current = back;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /* keys: right arrow and Enter go on, left arrow goes back, Escape skips.
     Enter is left alone when a button or link has focus (it does its own thing). */
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEnd("skip");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advanceRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        backRef.current();
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
        {STEP_CHIPS[step].length > 0 && (
          <span className="chips">
            {STEP_CHIPS[step].map((b) => (
              <span className="chip" key={b}>
                <Icon name={CHIPS[b].icon} />
                {CHIPS[b].label}
              </span>
            ))}
          </span>
        )}
        <p>{step === 0 ? firstText(nap) : TEXTS[step]}</p>
      </div>
      <div className="acts">
        {/* Terug keeps its place on step 1 so the dots do not jump */}
        <button type="button" className="back" aria-label="Terug" onClick={back} style={{ visibility: first ? "hidden" : "visible" }} tabIndex={first ? -1 : 0}>
          <Icon name="terug" />
          <span>Terug</span>
        </button>
        <span className="mid">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: TOUR_STEPS }, (_, i) => (
              <i key={i} className={i === step ? "on" : undefined} />
            ))}
          </span>
          <button type="button" className="skiplink" onClick={() => onEnd("skip")}>
            <span className="long">Rondleiding </span>overslaan
          </button>
        </span>
        <button type="button" className={last ? "next try" : "next"} aria-label={last ? undefined : "Verder"} ref={nextBtn} onClick={advance}>
          {last ? (
            "Zelf proberen"
          ) : (
            <>
              <span>Verder</span>
              <Icon name="verder" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
