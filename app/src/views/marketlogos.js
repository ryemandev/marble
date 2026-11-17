import { TICKER_LOGOS } from "../mode";
import cme from "./marketlogos/cme.svg?raw";
import dax from "./marketlogos/dax.svg?raw";
import dowjones from "./marketlogos/dowjones.svg?raw";
import ftse100 from "./marketlogos/ftse100.svg?raw";
import nasdaq from "./marketlogos/nasdaq.svg?raw";
import sp500 from "./marketlogos/sp500.svg?raw";

const clean = (svg) => svg.replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<title>[^<]*<\/title>/, "").trim();
const LOGOS = { cme, dax, dowjones, ftse100, nasdaq, sp500 };

// The logo as inline SVG, so the card can print it in its own ink. Our own files, so safe to place.
export const logoSvg = (key) => (TICKER_LOGOS && LOGOS[key] ? clean(LOGOS[key]) : null);
