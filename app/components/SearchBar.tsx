import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Icon } from "./Icons";

export interface SearchBarHandle {
  /* empty the field and give it focus (the Begin button) */
  reset: () => void;
}

/* Search field with its own thick blinking cursor that follows the typed
   text. The real caret is hidden in css. */
export function SearchBar({
  onSearch,
  handle,
  busy = false,
  message,
}: {
  onSearch: (address: string) => void;
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
      input.current?.focus();
    },
  }));

  return (
    <>
    <form
      className="search"
      id="form"
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
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
          placeholder="Straat en plaats"
          aria-label="Adres"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <span className="caret" aria-hidden="true" ref={caret} />
        <span className="mirror" aria-hidden="true" ref={mirror} />
      </span>
      <button type="submit" disabled={busy}>
        <Icon name="zoek" className="zoek" /> {busy ? "Zoeken…" : "Zoek"}
      </button>
    </form>
    <p className="searchmsg" role="status">
      {message}
    </p>
    </>
  );
}
