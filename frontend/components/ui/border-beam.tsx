/* A kiemelt kártya szegélyén körbefutó fénycsík — tisztán CSS (globals.css
   .border-beam), GPU-n fut. A szülőnek position: relative kell legyen. */
export function BorderBeam() {
  return <span aria-hidden className="border-beam" />;
}
