import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

/* The tour after a search: one story card floating over the grid. Every
   step scrolls the grid to a block (the page does that, see onChange) and
   lights up the menu button that belongs to it. The texts explain what you
   look at and what you can do; they never repeat the facts on the block. */

type NavButton = "huis" | "tijd" | "buurt" | "risk";
type IconName = Parameters<typeof Icon>[0]["name"];

export const TOUR_STEPS = 4;

/* the menu button each step lights up; step 1 has none, step 4 also pulses Als het misgaat */
export const TOUR_BUTTONS: (NavButton | undefined)[] = [undefined, "tijd", "buurt", "huis"];
export const TOUR_PULSE: (NavButton | undefined)[] = [undefined, undefined, undefined, "risk"];

const TEXTS = [
  "Zeeniveau is de hoogte van de zee. Woon je eronder, dan houdt iets het water voor je tegen. In deze rondleiding ontdek je wat.",
  "Hier zie je hoe deze plek droog werd. Lees van boven naar beneden, van de eerste dijk tot vandaag.",
  "Sommige gemalen pompen nog elke dag, andere zijn museum geworden. Klik op een stip om te zien welke.",
  "Dit is jouw huiskamer. Wat als de dijk breekt, het gemaal stopt of het heel hard regent? Druk op Als het misgaat en kijk hoe hoog het water hier komt.",
];

/* on phones the menu is hidden during the tour, so the buttons show as labels in the text */
const CHIPS: Record<NavButton, { icon: IconName; label: string }> = {
  huis: { icon: "huis", label: "Huiskamer" },
  tijd: { icon: "tijd", label: "Tijdreis" },
  buurt: { icon: "buurt", label: "Gemalen" },
  risk: { icon: "drop", label: "Als het misgaat" },
};
const STEP_CHIPS: NavButton[][] = [[], ["tijd"], ["buurt"], ["huis", "risk"]];

export function Rondleiding({
  paused,
  onChange,
  onEnd,
}: {
  /* true while another dialog (Over) is open: the keys are left alone */
  paused: boolean;
  /* a step is on screen; inset is the height the card covers at the bottom */
  onChange: (step: number, inset: number) => void;
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
    onChangeRef.current(step, r ? Math.max(0, window.innerHeight - r.top) : 0);
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
        <p>{TEXTS[step]}</p>
      </div>
      <div className="acts">
        {/* Terug keeps its place on step 1 so the dots do not jump */}
        <button type="button" className="back" aria-label="Terug" onClick={back} style={{ visibility: first ? "hidden" : "visible" }} tabIndex={first ? -1 : 0}>
          <Icon name="terug" />
          <span>Terug</span>
        </button>
        <span className="dots" aria-hidden="true">
          {Array.from({ length: TOUR_STEPS }, (_, i) => (
            <i key={i} className={i === step ? "on" : undefined} />
          ))}
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
      <button type="button" className="skiplink" onClick={() => onEnd("skip")}>
        Rondleiding overslaan
      </button>
    </div>
  );
}
