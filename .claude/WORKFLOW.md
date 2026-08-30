# Agent-workflow för Counter

Ett flöde med fyra roller som tar en idé hela vägen till testad kod.
Rollerna är **subagenter** (egna `.claude/agents/*.md`-filer). De pratar
inte med varandra själva – huvudsessionen (Claude i terminalen) är
dirigent och skickar vidare output mellan stegen.

## Rollerna

| Roll | Fil | Modell | Tänk | Får göra |
|------|-----|--------|------|----------|
| **owner** | `agents/owner.md` | opus | medium | Läsa kod, diskutera, skriva ett *Implementation Brief*. Ingen kod. |
| **senior-engineer** | `agents/senior-engineer.md` | opus | max, plan-läge | Läsa kod, skriva en teknisk plan. Ingen kod. |
| **junior-engineer** | `agents/junior-engineer.md` | sonnet | medium | Skriva/ändra kod enligt planen. Committar inte. |
| **tester** | `agents/tester.md` | sonnet | medium | Köra tester/typecheck/lint/bygge, granska diffen. Ingen kod. |

### Om "ultrathink" på senior engineer
Det finns ingen frontmatter för tänk-nivå på en subagent – `effort: max`
är den knapp som finns per roll, och den är satt. Subagenten **ärver**
dessutom din sessions thinking-läge. Vill du ha äkta ultrathink på
planeringen: ha extended thinking påslaget i sessionen när du kör
`/feature`.

## Så här kör du

### `/feature <vad du vill bygga>`
Kör hela kedjan:

```
0. Dirigenten kollar att git-trädet är rent, sparar HEAD, skapar
   grenen feature/<slug>
1. owner  ──dialog med dig──▶  Implementation Brief
2. senior-engineer (plan-läge)  ──▶  teknisk plan
3. junior-engineer  ──▶  implementation i arbetsträdet
4. tester  ──▶  PASS  eller  FAIL-lista
        │
        FAIL ──▶ junior-engineer fixar ──▶ tester igen   (max 3 varv)
        │
        PASS ──▶ 5. sammanfattning + hur du provkör
```

**Steg 1 är interaktivt** – owner ställer motfrågor, du svarar, dirigenten
relär. Resten går automatiskt utan godkännande-stopp (du ser briefen och
planen passera, men flödet väntar inte in dig).

**Om loopen fastnar** (3 varv utan grönt, eller samma fel om och om igen):
dirigenten återställer allt nytt (`git reset --hard` till sparad HEAD +
`git clean -fd`), tar bort `feature/<slug>`, och lämnar tillbaka till
**owner** som ber om ursäkt och peppar till ett nytt försök med annan väg.

Inget commit:as automatiskt någonstans. Vid lyckat resultat ligger
ändringarna på grenen `feature/<slug>` för dig att granska och själv
`git commit` / `git push`.

### `/discuss <vad du vill bolla>`
Bara owner, ingen plan, ingen kod. Bra för att tänka högt innan du är
redo för `/feature`. Kan sluta i ett Implementation Brief som du sedan
ger till `/feature`.

## Justera flödet
- **Byt modell/tänk på en roll:** ändra `model:` / `effort:` i rollens
  `.md`-fil. `effort` kan vara `low` / `medium` / `high` / `xhigh` / `max`.
- **Fler eller färre loop-varv:** ändra "max 3 varv" i `commands/feature.md`.
- **Godkännande-grindar tillbaka:** lägg in ett stopp efter steg 1 och 2 i
  `commands/feature.md` ("visa X för användaren och vänta på klartecken").
- **Vad testaren kör:** listan i `agents/tester.md`.

## Filer
```
.claude/
├── agents/
│   ├── owner.md
│   ├── senior-engineer.md
│   ├── junior-engineer.md
│   └── tester.md
├── commands/
│   ├── feature.md      → /feature
│   └── discuss.md      → /discuss
├── settings.json       → tillåter test/lint/bygge-kommandon utan prompt
└── WORKFLOW.md         → den här filen
```
