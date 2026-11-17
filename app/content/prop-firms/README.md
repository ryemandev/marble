# Prop firm pages

One file per firm, named by the firm's slug in `src/lib/firm-rules/index.json`. `scripts/build-firms.mjs` builds `/prop-firms/<firm>/` from it: the tables, the at-a-glance box, the questions and the sources all come from the rules data, so the file only holds what the data can't say.

Front matter: `firm`, `title` (60 characters or fewer), `description` (160 or fewer), `date` (the release day), `updated`, and optional `faq` pairs added to the generated questions.

The body is a short "What stands out" in plain English. Every figure in it must match the data for the firm's main plan. When a firm's rules are re-checked, read its body again and set `updated`.
