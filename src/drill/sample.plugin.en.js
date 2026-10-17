const VERBS = [
  ["ser", "soy", "fui"],
  ["dar", "doy", "di"],
  ["tener", "tengo", "tuve"],
  ["hacer", "hago", "hice"],
  ["poner", "pongo", "puse"],
  ["decir", "digo", "dije"],
  ["venir", "vengo", "vine"],
  ["saber", "sé", "supe"],
  ["estar", "estoy", "estuve"],
  ["traer", "traigo", "traje"],
];

const plugin = {
  title: "Spanish irregular verbs",
  description: "A sample generator: the yo form of irregular Spanish verbs.",
  topics: [
    {
      id: "forms",
      title: "Yo forms",
      theory: [
        "## Model",
        "",
        "Irregular verbs change their stem in the yo form, so the form has to be remembered.",
        "",
        "| infinitive | present | preterite |",
        "|---|---|---|",
        "| tener | tengo | tuve |",
        "| hacer | hago | hice |",
      ].join("\n"),
    },
  ],
  templates: [
    {
      id: "present",
      topic: "forms",
      kind: "choice",
      rule: "The yo form of an irregular verb in the present does not follow the `-o` pattern of regular verbs, remember it.",
      make(r) {
        const [base, now, past] = r.pick(VERBS);
        return {
          prompt: `Present, yo form of \`${base}\`?`,
          answer: now,
          choices: [now, past, `${base.slice(0, -2)}o`, base],
          explain: `${base}: ${now} (present), ${past} (preterite)`,
        };
      },
    },
    {
      id: "preterite",
      topic: "forms",
      kind: "text",
      rule: "The preterite tells about a finished action in the past.",
      make(r) {
        const [base, now, past] = r.pick(VERBS);
        return { prompt: `Preterite, yo form of \`${base}\`?`, answer: past, explain: `${base}: ${now} (present), ${past} (preterite)` };
      },
    },
  ],
};
