---
description: Kör hela agent-flödet owner → senior engineer → junior engineer ⇄ testare för en ny feature
argument-hint: <kort beskrivning av vad du vill bygga>
---

Användaren vill bygga: **$ARGUMENTS**

Du är dirigent för projektets fyra-roller-flöde. Rollerna är subagenter i
`.claude/agents/` – starta dem med Agent-verktyget och för vidare varje
rolls output till nästa. (Du behöver `SendMessage` för owner-dialogen;
ladda det med ToolSearch om det inte redan är laddat.)

## 0. Förberedelse
1. Kör `git status --porcelain`. Om arbetsträdet inte är rent: stoppa och
   be användaren committa eller stasha först (inklusive dessa
   workflow-filer).
2. Spara startläget: kör `git rev-parse HEAD` (kalla värdet START_SHA) och
   notera nuvarande grennamn. Skapa en arbetsgren:
   `git switch -c feature/<slug>` där `<slug>` är en kebab-case-form av idén.
3. Säg kort till användaren vilken gren du är på och att flödet startar.

## 1. Owner (dialog)
Starta `owner`-agenten med idén. Detta steg är interaktivt: relä agentens
frågor till användaren och användarens svar tillbaka till agenten
(SendMessage) tills agenten levererar ett "Implementation Brief". Visa
briefen för användaren och gå sedan vidare automatiskt.

## 2. Senior engineer (plan)
Starta `senior-engineer` med briefen. Den kör i plan-läge och returnerar
en teknisk plan, med detaljnivå anpassad efter featurens storlek. Ge
användaren en kort sammanfattning av planen (berörda filer, vägval,
öppna frågor) – klistra inte in hela planen om den är lång. Gå vidare
automatiskt.

## 3. Junior engineer (implementation)
Starta `junior-engineer` med briefen + planen. Invänta dess rapport.

## 4. Testare ⇄ junior (loop, max 3 varv)
Håll en varv-räknare (börjar på 1). Upprepa:
1. Starta `tester`. Läs verdiktet.
2. `VERDIKT: PASS` → gå till steg 5.
3. `VERDIKT: FAIL`:
   - Om varv-räknaren > 3 → gå till **Avbryt**.
   - Om testarens fynd i praktiken är samma som föregående varv (ingen
     framgång mellan varven) → gå till **Avbryt**.
   - Annars: starta `junior-engineer` igen med testarens fyndlista, öka
     varv-räknaren med 1, och gå tillbaka till 1.

## 5. Klar
Sammanfatta för användaren: vad som byggdes, `git diff --stat`, testarens
gröna utfall, och – enligt CLAUDE.md – exakt hur hen provkör det själv
(mobil/simulator/webb, konkreta kommandon). Committa INTE. Lämna grenen
`feature/<slug>` för användaren att granska och själv committa/pusha.

## Avbryt (loopen fastnar eller når taket)
1. Säg kort och ärligt till användaren att det inte gick att få stabilt.
2. Återställ allt nytt: `git reset --hard START_SHA` (det sparade värdet)
   och `git clean -fd`. Kör sedan `git switch -` tillbaka till
   ursprungsgrenen och `git branch -D feature/<slug>`.
3. Starta `owner`-agenten igen med kontexten att implementationen av
   "$ARGUMENTS" inte gick att få stabil, plus en sammanfattning av var
   testaren fastnade. Låt owner ge en kort, ärlig och peppande replik på
   svenska + förslag på en annan väg eller ett smalare scope.
4. Stanna i owner-läge och vänta på användaren.
