# Quick Reference: Trading Costs

## TL;DR

**Bij sluiten van een positie op Deribit betaal je verschillende fees afhankelijk van HOE je sluit:**

| Exit Methode | Fee Type | Fee % | Voorbeeld ($1000) |
|--------------|----------|-------|-------------------|
| Take Profit | Maker | 0.02% | $0.20 |
| Market Close | Taker | 0.05% | $0.50 |
| Stop Loss | Taker | 0.05% | $0.50 |

**Met leverage betaal je fees op de notional value (positie × leverage)**

## Scenarios Uitgelegd

### ✅ Take Profit Hit (Beste)
- Je TP limit order staat op het orderbook
- Prijs raakt je TP → order wordt gevuld
- **Je voegt liquiditeit toe** → Maker fee (0.02%)
- Laagste kosten!

### ⚠️ Market Close (Gemiddeld)
- Je besluit handmatig te sluiten
- Je gebruikt een market order voor snelle exit
- **Je neemt liquiditeit weg** → Taker fee (0.05%)
- 2.5x duurder dan TP

### ❌ Stop Loss Hit (Slechtste)
- Prijs triggert je SL
- SL wordt market order → direct uitgevoerd
- **Je neemt liquiditeit weg** → Taker fee (0.05%)
- Zelfde kosten als market close

## Leverage Effect

```
Voorbeeld: $100 positie

1x leverage:
- Notional: $100
- TP fee: $0.02 (0.02%)
- Market fee: $0.05 (0.05%)

5x leverage:
- Notional: $500
- TP fee: $0.10 (0.02%)
- Market fee: $0.25 (0.05%)

50x leverage:
- Notional: $5,000
- TP fee: $1.00 (0.02%)
- Market fee: $2.50 (0.05%)
```

**Let op**: Fees blijven hetzelfde percentage, maar je betaalt ze over een grotere notional value!

## Break-Even Moves

**Hoeveel moet de prijs bewegen om je fees terug te verdienen?**

Met TP exit (maker):
- Entry fee: 0.05%
- Exit fee: 0.02%
- **Total: 0.07% minimum move**

Met Market/SL exit (taker):
- Entry fee: 0.05%
- Exit fee: 0.05%
- **Total: 0.10% minimum move**

## Minimum Profit Targets

**Aanbevolen minimale targets (incl. fees):**

| Trading Style | Met TP | Met Market Close |
|--------------|--------|------------------|
| Scalping | ≥0.15% | ≥0.25% |
| Day Trading | ≥0.30% | ≥0.40% |
| Swing Trading | ≥0.50% | ≥0.60% |

## Tips

1. **Plan je exits**: Gebruik TP orders (maker) waar mogelijk
2. **Vermijd market closes**: 2.5x duurder dan TP
3. **Let op leverage**: Hogere leverage = hogere absolute fees
4. **Bereken vooraf**: Gebruik de cost calculator in Settings
5. **Test eerst**: Probeer kleine trades op testnet

## Meer Info

Ga naar **Settings** → **Kosten** tab voor:
- Interactieve cost calculator
- Gedetailleerde breakdown per scenario
- Leverage impact analysis
- Complete trade cost berekening

---

**Bron**: Deribit officiele fee structure (https://www.deribit.com/pages/information/fees)
