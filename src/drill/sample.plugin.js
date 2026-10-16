const VERBS = [
  ["go", "went", "gone"],
  ["see", "saw", "seen"],
  ["take", "took", "taken"],
  ["write", "wrote", "written"],
  ["give", "gave", "given"],
  ["eat", "ate", "eaten"],
  ["speak", "spoke", "spoken"],
  ["drive", "drove", "driven"],
  ["know", "knew", "known"],
  ["begin", "began", "begun"],
];

const plugin = {
  title: "Неправильные глаголы",
  description: "Пример генератора: формы неправильных глаголов английского.",
  topics: [
    {
      id: "forms",
      title: "Три формы",
      theory: [
        "## Модель",
        "",
        "У неправильного глагола три формы: начальная, Past Simple и Past Participle.",
        "",
        "| начальная | Past Simple | Past Participle |",
        "|---|---|---|",
        "| go | went | gone |",
        "| see | saw | seen |",
      ].join("\n"),
    },
  ],
  templates: [
    {
      id: "past",
      topic: "forms",
      kind: "choice",
      rule: "Past Simple неправильного глагола не строится через `-ed`, его нужно помнить.",
      make(r) {
        const [base, past, done] = r.pick(VERBS);
        return {
          prompt: `Past Simple от \`${base}\`?`,
          answer: past,
          choices: [past, done, `${base}ed`, base],
          explain: `${base}, ${past}, ${done}`,
        };
      },
    },
    {
      id: "done",
      topic: "forms",
      kind: "text",
      rule: "Past Participle нужен в Present Perfect и в страдательном залоге.",
      make(r) {
        const [base, past, done] = r.pick(VERBS);
        return { prompt: `Past Participle от \`${base}\`?`, answer: done, explain: `${base}, ${past}, ${done}` };
      },
    },
  ],
};
