const w = typeof window === "undefined" ? {} : window;
export const LIVE = !!w.MARBLE_APP && !w.MARBLE_DEMO;

export const VOICE_LIVE = false;

export const appUrl = () => `${location.origin}${location.pathname.replace(/index\.html$/, "")}`;
export const LEGAL = "../legal.html";

// Money on a trader's own flex cards, on for everyone since 5 Nov 2026 (owner: "switch everything on"). The figure is
// what the trader logged or imported, and a card always says when the money is simulated.
export const MONEY_CARDS = true;

// Dollars on posts and messages. A live post's trade is built on the server by trade_card, which has sent its dollars
// and the account's stage since 5 Nov 2026. An anonymous post carries neither.
export const POST_MONEY = true;

// Index and exchange logos on a trader's own trade cards. One switch, because each owner asks for written
// permission: with it off, a card prints the market's code instead. Never on Marble's own marketing.
export const TICKER_LOGOS = true;
// The boards and crew placings. Off: the score counts imported trades, and anyone can type an import in, so a place
// on it means nothing yet (owner, 5 Nov 2026: "Yes, hide them"). Crews, their rooms and joining stay. True brings back
// the board, the crew placings and the opt-in, and the website copy would need writing back.
export const BOARDS = false;

// Direct broker connections: Topstep, Interactive Brokers and the crypto wallet. Off: trades come from a file
// or by hand until sync can be offered (owner, 5 Nov 2026). The code stays, so true brings back the Connect
// tab and the background sync. The website and legal copy would need writing back too.
export const BROKER_SYNC = false;
