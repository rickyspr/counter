---
description: Bolla en idé eller ett angreppssätt med "owner" utan att starta hela bygg-flödet
argument-hint: <vad du vill bolla>
---

Starta `owner`-agenten (Agent-verktyget) för att diskutera: **$ARGUMENTS**

Detta är bara en diskussion – ingen plan, ingen kod. Relä owners frågor
till användaren och svaren tillbaka (SendMessage; ladda det med ToolSearch
om det behövs) så länge samtalet pågår. När användaren är nöjd kan owner
sammanfatta i ett "Implementation Brief" som sedan kan matas till
`/feature`.
