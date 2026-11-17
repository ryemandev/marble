export const GROUPS = [
  {
    key: "free",
    label: "Free",
    items: [
      {
        q: "How much is Marble?",
        a: "Nothing. Marble is free forever, with every feature in it. There's no payment, no card to enter, no trial and no plans to choose.",
      },
      {
        q: "Why is it free?",
        a: "So any trader can see where their money goes. The cost shouldn't be the reason a trader doesn't keep a journal.",
      },
      {
        q: "How does Marble make money?",
        a: "It doesn't yet. We plan to earn from prop firm affiliate codes: if you use one of our codes at a firm, the firm pays us a commission. Using one is up to you, we'll label every code, and we don't recommend any firm as a way to make money. The journal stays free either way, and your journal isn't for sale.",
      },
    ],
  },
  {
    key: "journal",
    label: "The journal",
    items: [
      {
        q: "How do trades get into Marble?",
        a: "You log them in seconds: the symbol, the side and the dollars. Add your prices if you want them and Marble works the dollars out for you, with the setup and how it felt alongside. Or bring them in: drop the export from Tradovate, TopstepX, Rithmic (R | Trader Pro), NinjaTrader, MetaTrader 4 or 5, cTrader or Interactive Brokers, and Marble pairs every fill into trades and skips any it already has.",
      },
      {
        q: "Does it work with my prop firm or broker?",
        a: "Yes. Add any account you trade, at any firm or broker, and Marble adds them into one total P&L. Look at all of them, several or just one. Import the file your platform exports (Tradovate, TopstepX, Rithmic, NinjaTrader, MetaTrader, cTrader, DXtrade, Interactive Brokers and more) or log trades by hand. Marble never asks for your trading password and never places orders.",
      },
      {
        q: "How do I see what I've made or lost?",
        a: "In dollars, everywhere. The Desk, Journal and Stats show your total P&L by day, week, month, all time or a range you set, for the accounts you pick. The calendar shows each day's P&L, and Stats breaks it down by day of the week, hour, time held, setup, symbol and account.",
      },
      {
        q: "Where can I use it?",
        a: "In your browser, on your phone or your desktop. Add it to your home screen and it opens like an app.",
      },
      {
        q: "What's Ask your journal?",
        a: "The part of Marble that reads your journal and answers in numbers. Pick a question, like what your Friday afternoons cost or what your best and worst hours are, and it works the answer out from your own trades and lists the trades behind it. There's no AI in it, and your journal doesn't leave the app for it.",
      },
    ],
  },
  {
    key: "data",
    label: "Your data",
    items: [
      {
        q: "Who can see my journal?",
        a: "Only you. Your journal is private. What you share on the Floor is up to you, and you can post anonymously. Our admin area shows how many trades an account has, never the trades.",
      },
      {
        q: "Do you sell my data?",
        a: "Never. Prop firm codes won't change that: nothing from your journal goes to a firm.",
      },
      {
        q: "Can I take my data with me?",
        a: "Yes. Export everything as one zip file from your profile whenever you like, your photos included, or delete your account and everything in it. If Marble ever closes, we'll email you your data first.",
      },
    ],
  },
  {
    key: "community",
    label: "The Floor and the founder",
    items: [
      {
        q: "What's on the Floor?",
        a: "A live band shows who's here and what's on, then every space sits in one place. Feed is for wins, lessons and questions, under your name or anonymously. Chat has rooms for everyone, a private room for your crew and your private messages. Your crew is one of three teams, each with a private room. Your cards holds every card you've made, for you to share if you want to. In Ideas & polls you vote on what Marble builds next. No selling signals, no paid groups.",
      },
      {
        q: "Who built Marble?",
        a: "Jules, the founder. Replace this answer with a line about who runs your Marble.",
        link: { href: "#founder", label: "Read his letter" },
      },
    ],
  },
];

export const ALL = GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.key, groupLabel: g.label })));
