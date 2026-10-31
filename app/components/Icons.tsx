/* Own line icons as svg symbols, used with <Icon name="huis" />. */

export type IconName =
  | "huis"
  | "tijd"
  | "buurt"
  | "drop"
  | "pomp"
  | "terug"
  | "pin"
  | "zoek"
  | "img"
  | "info"
  | "share"
  | "close"
  | "fullscreen"
  | "verder";

export function SvgSymbols() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="i-huis" viewBox="0 0 24 24">
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-6h4v6" />
      </symbol>
      <symbol id="i-tijd" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3 2" />
      </symbol>
      <symbol id="i-buurt" viewBox="0 0 24 24">
        <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
        <circle cx="12" cy="11" r="2.2" />
      </symbol>
      <symbol id="i-drop" viewBox="0 0 24 24">
        <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />
        <path d="M9 14a3 3 0 0 0 3 3" />
      </symbol>
      <symbol id="i-pomp" viewBox="0 0 24 24">
        <rect x="4" y="9" width="16" height="11" rx="2" />
        <path d="M8 9V5h8v4" />
        <path d="M8 15h8" />
        <circle cx="12" cy="15" r="2" />
      </symbol>
      <symbol id="i-terug" viewBox="0 0 24 24">
        <path d="M19 12H6" />
        <path d="m11 6-6 6 6 6" />
      </symbol>
      <symbol id="i-verder" viewBox="0 0 24 24">
        <path d="M5 12h13" />
        <path d="m13 6 6 6-6 6" />
      </symbol>
      <symbol id="i-pin" viewBox="0 0 24 24">
        <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
      </symbol>
      <symbol id="i-zoek" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4.5-4.5" />
      </symbol>
      <symbol id="i-info" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </symbol>
      <symbol id="i-share" viewBox="0 0 24 24">
        <path d="M12 15V4" />
        <path d="m8 8 4-4 4 4" />
        <path d="M5 13v6h14v-6" />
      </symbol>
      <symbol id="i-close" viewBox="0 0 24 24">
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </symbol>
      <symbol id="i-fullscreen" viewBox="0 0 24 24">
        <path d="M4 9V4h5" />
        <path d="M20 9V4h-5" />
        <path d="M4 15v5h5" />
        <path d="M20 15v5h-5" />
      </symbol>
      <symbol id="i-img" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="m4 18 5-5 4 4 3-3 4 4" />
      </symbol>
    </svg>
  );
}

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" className={className}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
