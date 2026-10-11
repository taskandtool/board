// The few icons the board uses, drawn on one 16-unit grid with a 1.5 stroke
// in currentColor, so they take the text colour around them.
const paths = {
  search: <><circle cx="7" cy="7" r="4.25" /><path d="m10.25 10.25 3.25 3.25" /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  x: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  back: <path d="M12.5 8h-9m4-4-4 4 4 4" />,
  expand: <path d="M9.5 3.5h3v3m0-3L8.5 7.5M6.5 12.5h-3v-3m0 3 4-4" />,
  more: <><circle cx="3.75" cy="8" r=".75" /><circle cx="8" cy="8" r=".75" /><circle cx="12.25" cy="8" r=".75" /></>,
  calendar: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3m5-3v3" /></>,
  flag: <path d="M3.5 14V2.75m0 .75h8l-1.75 3 1.75 3h-8" />,
  check: <><rect x="2.5" y="2.5" width="11" height="11" rx="2" /><path d="M5.5 8.25 7.25 10 10.5 6.5" /></>,
  done: <path d="M3.5 8.5 6.5 11.5 12.5 5" />,
  clip: <path d="m13.5 7.5-5.3 5.3a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6a2.1 2.1 0 0 1 3 3l-5.6 5.6a1.1 1.1 0 0 1-1.5-1.5L10.5 4.5" />,
  phone: <path d="M5.5 2.5h-2a1 1 0 0 0-1 1.1c.5 5.3 4.6 9.4 9.9 9.9a1 1 0 0 0 1.1-1v-2l-2.75-1-1.25 1.25a7 7 0 0 1-3.5-3.5L7.25 5Z" />,
  upload: <path d="M8 10.5V2.5m-3 3 3-3 3 3M2.5 10v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2" />,
  archive: <><rect x="2" y="3" width="12" height="3" rx="1" /><path d="M3 6v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 9h3" /></>,
  columns: <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M6.17 2.5v11m3.66-11v11" /></>,
  download: <path d="M8 2.5v8m-3-3 3 3 3-3M2.5 10v2a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-2" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, class: cls = "size-4" }: { name: IconName; class?: string }) {
  return (
    <svg class={"shrink-0 " + cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
