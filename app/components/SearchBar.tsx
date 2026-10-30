import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Icon } from "./Icons";
import { PLACE_FILTER, useSuggest, type LocatieserverDoc } from "../lib/locatieserver";

export interface SearchBarHandle {
  /* empty the field and give it focus (the Begin button) */
  reset: () => void;
}

/* wait this long after the last keystroke before asking for suggestions */
const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 6;

/* Search field with its own thick blinking cursor that follows the typed
   text. The real caret is hidden in css. While typing, address and town suggestions
   from the Locatieserver show below the field. */
export function SearchBar({
  onSearch,
  onPick,
  handle,
  busy = false,
  message,
}: {
  /* submit of the typed text */
  onSearch: (address: string) => void;
  /* a suggestion was chosen */
  onPick: (doc: LocatieserverDoc) => void;
  handle?: Ref<SearchBarHandle>;
  /* a search is running: block a second submit */
  busy?: boolean;
  /* shown under the field, e.g. when no address was found */
  message?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  /* the list is open after typing, closed after a pick, Escape or blur */
  const [open, setOpen] = useState(false);
  /* index of the highlighted suggestion, -1 for none */
  const [active, setActive] = useState(-1);
  const listId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);

  const q = debounced.length >= MIN_CHARS ? debounced : "";
  const suggest = useSuggest({ q, fq: PLACE_FILTER, rows: MAX_SUGGESTIONS, fl: "id weergavenaam" }, open && !busy);
  const docs = q ? (suggest.data?.response.docs ?? []) : [];
  const shown = open && !busy && docs.length > 0;

  /* a new list: nothing highlighted */
  useEffect(() => setActive(-1), [suggest.data]);

  /* move the caret to the end of the text and restart its blink */
  useEffect(() => {
    const q = input.current;
    const m = mirror.current;
    const c = caret.current;
    if (!q || !m || !c) return;
    m.textContent = value;
    c.style.left = `${Math.min(m.offsetWidth + 1, q.clientWidth - 4)}px`;
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  }, [value]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useImperativeHandle(handle, () => ({
    reset() {
      setValue("");
      setOpen(false);
      input.current?.focus();
    },
  }));

  function pick(doc: LocatieserverDoc) {
    setValue(doc.weergavenaam);
    setOpen(false);
    onPick(doc);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!shown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % docs.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? docs.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(docs[active]);
    }
  }

  return (
    <>
      <div className="searchwrap">
        <form
          className="search"
          id="form"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            if (!busy) onSearch(value.trim());
          }}
        >
          <svg width="22" height="22" aria-hidden="true">
            <use href="#i-pin" />
          </svg>
          <span className="field">
            <input
              id="q"
              ref={input}
              type="text"
              placeholder="Adres of plaats"
              aria-label="Adres of plaats"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={shown}
              aria-controls={listId}
              aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setOpen(false)}
            />
            <span className="caret" aria-hidden="true" ref={caret} />
            <span className="mirror" aria-hidden="true" ref={mirror} />
          </span>
          <button type="submit" disabled={busy}>
            <Icon name="zoek" className="zoek" /> {busy ? "Zoeken…" : "Zoek"}
          </button>
        </form>
        <ul className="suggest" id={listId} role="listbox" aria-label="Adressen en plaatsen" hidden={!shown}>
          {docs.map((d, i) => (
            <li
              key={d.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              /* mousedown, not click: picking must happen before the input blurs */
              onMouseDown={(e) => {
                e.preventDefault();
                pick(d);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <svg width="16" height="16" aria-hidden="true">
                <use href="#i-pin" />
              </svg>
              <span>{d.weergavenaam}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="searchmsg" role="status">
        {message}
      </p>
    </>
  );
}
