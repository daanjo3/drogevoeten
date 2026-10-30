import { useState, type Ref } from "react";
import { Landscape } from "./Landscape";
import { SearchBar, type SearchBarHandle } from "./SearchBar";
import type { LocatieserverDoc } from "../lib/locatieserver";
import { TERMS } from "../data/place";
import { Tip } from "./Tip";

/* idle: visible and waiting for an address. going: the leaving transition
   runs (text slides away, pin drops, we dive into the landscape). hidden:
   faded out, the canvas is in view. */
export type StartPhase = "idle" | "going" | "hidden";

const EXAMPLES: { label: string; address: string }[] = [
  { label: "Middelburg", address: "Abdij 4, Middelburg" },
  { label: "Middenbeemster", address: "Middenweg 68a, Middenbeemster" },
  { label: "Nieuwerkerk", address: "Koningin Maudplein 1, Nieuwerkerk" },
];

export function StartScreen({
  phase,
  onSearch,
  onPick,
  searchHandle,
  busy = false,
  message,
}: {
  phase: StartPhase;
  onSearch: (address: string) => void;
  onPick: (doc: LocatieserverDoc) => void;
  searchHandle?: Ref<SearchBarHandle>;
  busy?: boolean;
  message?: string | null;
}) {
  /* pointer position from -0.5 to 0.5, for the parallax */
  const [dx, setDx] = useState(0);
  const className = phase === "idle" ? undefined : phase === "going" ? "going" : "going hide";

  return (
    <section
      id="start"
      className={className}
      onPointerMove={(e) => {
        if (phase === "idle") setDx(e.clientX / window.innerWidth - 0.5);
      }}
    >
      <Landscape phase={phase === "idle" ? "idle" : "going"} dx={dx} />
      <svg id="drop" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" fill="#FFA654" />
      </svg>
      <div className="startbox">
        <h1>Wie houdt jouw voeten droog?</h1>
        <p className="lead">
          Een kwart van Nederland ligt lager dan de{" "}
          <Tip kind="term" tip={TERMS.zeeniveau}>
            zee
          </Tip>
          . Dat je hier droog zit, gaat niet vanzelf. Al eeuwen pompen molens en
          gemalen het water weg, en houden dijken de zee tegen. Typ je adres of woonplaats. Dan zie je wie jouw plek droog houdt, en wat er
          gebeurt als het misgaat.
        </p>
        <SearchBar onSearch={onSearch} onPick={onPick} handle={searchHandle} busy={busy} message={message} />
        <div className="defaults">
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" disabled={busy} onClick={() => onSearch(x.address)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {/* credit line: NDE logo and the hackathon, leaves with the rest */}
      <div className="nde">
        <a href="https://netwerkdigitaalerfgoed.nl" target="_blank" rel="noreferrer">
          <img src="/img/nde-logo-wit.png" alt="Netwerk Digitaal Erfgoed" />
        </a>
        <span>Gemaakt in 24 uur tijdens HackaLOD 2026, een hackathon van het Netwerk Digitaal Erfgoed.</span>
      </div>
    </section>
  );
}
