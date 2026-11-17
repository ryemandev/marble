# Marble's look and rules (the Drip rebuild)

Marble is a place traders come. The logo is loud and everything else is quiet.
Read this before touching a screen. `drip.css` holds the tokens; `src/views/Dashboard.jsx` and
`src/drip/DailyClose.jsx` are the reference for how a finished screen looks and is written.

## Look
- Pure white `#fff` and true black `#000`, soft grey `#f3f3f2` for panels. Tokens: `--bg --panel --panel-2 --panel-3 --text --text-2 --text-3 --line --press --paper --win --loss`. Never literal colours except on black overlays. Light only: Marble has no dark mode, and never adds one (owner, 4 Nov 2026).
- Unbounded 800 (`var(--display)`, class `.loud`) for big type and big numbers only. Geist (`var(--sans)`) for everything else. Sentence case. No uppercase labels, no letter-spaced caps, no monospace.
- No blur, no gloss, no gradients on surfaces, no shadows on panels, no glass, no borders round panels (a panel is a grey shape on white), no red, no green. Win is ink. Loss is grey with a minus sign. Same layout whether the day was good or bad.
- Radius: 24px on panels (`--r-panel`), 20px on tiles (`--r-tile`), 12px on thumbnails and fields only (`--r-thumb`), pills for buttons. Space with `gap`.
- One gutter on a phone: the page's own 16px. A screen adds no side padding of its own.
- In a row, the name is weight 500 and at most one thing is 600, the figure.
- Motion is crisp and smooth, under about 300ms for small things, `var(--ease)`. Nothing stepped, nothing bouncing for its own sake. No confetti, no flames. Respect `reducedMotion()`.
- Liquid is the signature, used with restraint (owner, 4 Nov 2026: "some of it was a bit much"). Only two things keep moving liquid: the Desk's week tank (`drip/Tank.jsx`) and the ink pour at the daily close (`drip/Pour.jsx`). The tab bar's droplet stays. Every other level is a still shape: `<Tank flat />` or plain CSS. No waves, no slosh, no rising fills anywhere else.
- The public word is "ink". Never "liquid" in copy, never "liquid glass".
- Mobile first, at 390px wide, then desktop. Tap targets 44px or more. Nothing scrolls sideways unless it's a deliberate strip.
- Every element earns its place. No filler, no dead buttons, no decorative boxes, no section just to look full. Fewer things, bigger.

## Pieces to reuse
`Card, Label, Pnl, Chip, Grade, Avatar, Icon` in `components/ui`; `SubTabs`, `Sheet`, `Field`, `Choice` in `components/forms`; `Section` in `print/ink` (a plain card with a title, despite the folder's name); `Modal` in `components/overlay`; charts in `components/charts`. Firm logos: `FirmLogo`, `AccountName` in `live/FirmPicker`. Stages: `STAGES, stageOf, simulated, isSample` in `drip/accounts`. Week and closes: `drip/week`. `money(v, { sign: true })` in `drip/week` for whole-dollar figures with a true minus sign.

## Pictures stay (owner, 4 Nov 2026)
"we are missing that pictures we had from the old website and app dont remove them reuse them in a way that matches what we are going for"

Every picture Marble had stays in use: `public/art/*` (gods, masters, prints, cars, money, textures, japan, anime), `public/site/*`, the flex-card shelves, setup plates, avatars, covers, crew and event pictures. Never delete an image file.
- Treatment: pressed to hard black and white, sharp, high contrast, flat. No overlay gradients, no blur, no tint, no rounded polaroid framing.
- `<InkPicture src at className edge>` in `drip/InkPicture.jsx`: the picture's foot runs into the page as ink. `edge={false}` for thumbnails and small crops. Give it a height with your own class. Inside a tank, `<Tank picture={{ src, at: [x, y], alpha }}>` shows the picture only where the ink is, so ink reveals it.
- A picture must be doing something: it belongs to a setup, a person, a card, a section. Big and few beats small and many.

## Honesty rules (these are not style, they decide what gets built)
- No number, reward or animation may improve because someone traded more.
- Same layout on red and green days. No streaks of green days, no 0-100 score, no profit-ranked boards, no comeback nudges.
- Evaluation and paper money is simulated: always labelled, never added to live or funded money.
- Broker sync is off (`BROKER_SYNC` in `mode.js`, owner, 5 Nov 2026): trades come from a file or by hand, so nothing carries the Verified mark. If it comes back, only broker-synced money gets the mark (`t.source === "sync"`).
- Never promise or imply profits. Never write "rat race", "financial freedom", "quit your job", "get funded" or "pass your evaluation". Don't claim journaling improves results. No "80% quit" figures. The trader's own number can be loud; Marble never says you can make this too.
- Any example number is labelled "Sample data" where it appears (`isSample()` / `useSample()`).
- Past losses are stated as past fact with the trades listed. Never "what you could have made".
- Marble never stores a trading password and never places orders. No AI in features.
- Money cards sit behind `MONEY_CARDS` in `mode.js` (off for live until a solicitor has checked them). Firm logos stay off shared cards until rights are checked.
- No franchise or brand characters, no plush, cute or stock pictures. The seal, kanji, paper textures and serif type are gone.

## Gone from the app
Dark mode, the monthly note, News (calendar, countdown, hands-off window), the right rail, the status bar, the orb, the splash, the plan, rules and briefs from the sides, the Marble score, the streak pill.

## Words
Plain English, British spelling. Short. No em dashes in copy. Tabs are Desk, Journal, Stats, Study, Floor.

## Green

One green, #16db65, in the tab bar only: the active tab and the dot beside Floor. Nothing on the main screens (owner, 4 Nov 2026: "just have it in the menu tab only"). Numbers, buttons and cards stay black and white.
