import { useState, type Ref } from "react";
import { Landscape } from "./Landscape";
import { SearchBar, type SearchBarHandle } from "./SearchBar";

/* idle: visible and waiting for an address. going: the leaving transition
   runs (text slides away, pin drops, we dive into the landscape). hidden:
   faded out, the canvas is in view. */
export type StartPhase = "idle" | "going" | "hidden";

const EXAMPLES: { label: string; address: string }[] = [
  { label: "Middelburg", address: "Abdij 4, Middelburg" },
  { label: "Beemster", address: "Middenweg 1, Beemster" },
  { label: "Nieuwerkerk", address: "Ring 1, Nieuwerkerk" },
];

export function StartScreen({
  phase,
  onSearch,
  searchHandle,
}: {
  phase: StartPhase;
  onSearch: (address: string) => void;
  searchHandle?: Ref<SearchBarHandle>;
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
        <path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" fill="#FFA654" stroke="#242424" strokeWidth="2" />
        <circle cx="12" cy="10" r="2.6" fill="#242424" />
      </svg>
      <div className="startbox">
        <h1>Wie houdt jullie voeten droog?</h1>
        <p>
          Een kwart van ons land ligt lager dan de zee. Iemand houdt dat land elke dag droog. Typ een adres, van de school of van
          je eigen huis. Dan laten we zien wie dat is.
        </p>
        <SearchBar onSearch={onSearch} handle={searchHandle} />
        <div className="defaults">
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" onClick={() => onSearch(x.address)}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
