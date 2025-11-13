# Trading Cost Analysis - Documentatie

## Overzicht

De Trading Cost Analysis module biedt gedetailleerde inzichten in de kosten van verschillende exit scenario's bij het handelen met leverage op Deribit.

## Toegang

De Cost Analysis tool is toegankelijk via:
- **Settings Dialog** → **Kosten** tab → **Open Kosten Calculator** knop

## Functionaliteit

### Exit Scenario's

De tool analyseert drie primaire exit scenario's:

#### 1. Market Close (Taker Fee)
- **Wanneer**: Handmatig sluiten van positie met market order
- **Fee Type**: Taker (0.05%)
- **Gebruik**: Snelle exit, onmiddellijke uitvoering
- **Cost Impact**: Hoogste fees door market order

#### 2. Take Profit Hit (Maker Fee)
- **Wanneer**: Take profit limit order wordt geraakt
- **Fee Type**: Maker (0.02%)  
- **Gebruik**: Geautomatiseerde exit bij winstdoel
- **Cost Impact**: Laagste fees (voegt liquiditeit toe)

#### 3. Stop Loss Hit (Taker Fee)
- **Wanneer**: Stop loss wordt getriggerd
- **Fee Type**: Taker (0.05%)
- **Gebruik**: Bescherming tegen grote verliezen
- **Cost Impact**: Hogere fees door market execution

## Fee Structure (Deribit)

### Basis Fees
```
Maker Fee:  0.02% (0.0002) - Limit orders die liquiditeit toevoegen
Taker Fee:  0.05% (0.0005) - Market orders die liquiditeit verwijderen
Settlement: 0.015% (0.00015) - Alleen bij finale settlement (niet regular closes)
```

### Leverage Impact

**Belangrijke opmerking**: Bij gebruik van leverage worden fees berekend op de volledige notional value.

**Voorbeeld**:
```
Position Size: $1,000
Leverage: 5x
Notional Value: $5,000

Maker Fee @ 0.02%: $1.00
Taker Fee @ 0.05%: $2.50
```

## Gebruik van de Calculator

### Stap 1: Invoer Parameters
- **Entry Price**: Inschrijfprijs van de trade ($)
- **Exit Price**: Verwachte exitprijs ($)
- **Position Size**: Grootte van de positie in USD
- **Leverage**: Gebruikte leverage (1x - 50x)

### Stap 2: Bereken
Klik op "Bereken Kosten" om de volledige analyse te genereren.

### Stap 3: Resultaten Interpreteren

#### Summary Cards
- **Best Case**: Laagste kosten (via TP/maker fee)
- **Market Close**: Gemiddelde kosten (via market order)
- **Worst Case**: Hoogste kosten (via SL/taker fee)

#### Totale Trade Kosten
Toont entry + exit kosten voor complete trade:
- Best scenario: Entry (taker) + Exit (maker via TP)
- Typical scenario: Entry (taker) + gemiddelde exit
- Worst scenario: Entry (taker) + Exit (taker via SL of market)

#### Gedetailleerde Breakdown
Voor elk scenario:
- Fee type (maker/taker)
- Trading fee in $ en %
- Notional value
- Uitleg van scenario

## Praktische Voorbeelden

### Voorbeeld 1: Small Position, No Leverage
```
Entry Price: $110,000
Exit Price: $110,500  
Position Size: $100
Leverage: 1x

Market Close: $0.05 (0.05%)
TP Hit: $0.02 (0.02%)
SL Hit: $0.05 (0.05%)

Total Cost (Entry + Best Exit): $0.07
```

### Voorbeeld 2: Medium Position, 5x Leverage
```
Entry Price: $110,000
Exit Price: $110,500
Position Size: $1,000
Leverage: 5x
Notional: $5,000

Market Close: $2.50 (0.05%)
TP Hit: $1.00 (0.02%)
SL Hit: $2.50 (0.05%)

Total Cost (Entry + Best Exit): $3.50
Total Cost (Entry + Worst Exit): $5.00
```

### Voorbeeld 3: Large Position, 50x Leverage
```
Entry Price: $110,000
Exit Price: $111,000
Position Size: $5,000
Leverage: 50x
Notional: $250,000

Market Close: $125.00 (0.05%)
TP Hit: $50.00 (0.02%)
SL Hit: $125.00 (0.05%)

Total Cost (Entry + Best Exit): $175.00
Total Cost (Entry + Worst Exit): $250.00

⚠️ Met hoge leverage worden fees aanzienlijk!
```

## Best Practices

### 1. Plan Voor Fees
- Bereken fees vooraf in je risk management
- Zorg dat TP target fees + desired profit dekt
- Bij kleine moves (<1%) zijn fees significant deel van P&L

### 2. Gebruik Maker Orders Waar Mogelijk
- TP orders zijn altijd maker (0.02%)
- Bespaar 60% op fees vs market close
- Plan trades met voldoende tijd voor limit execution

### 3. Wees Voorzichtig met Hoge Leverage
- Fees schalen lineair met leverage
- 50x leverage = 50x fees (op zelfde % basis)
- Overweeg lagere leverage voor kleine timeframe trades

### 4. Minimize Market Orders
- Market close is 2.5x duurder dan TP
- Plan exits via limit orders waar mogelijk
- Emergency exits accepteren hogere kosten

## Cost Impact op P&L

### Breakeven Berekening
Om break-even te zijn na fees:

**Met TP (maker) exit**:
```
Required Move = (Entry Fee + Exit Fee) / Position Size
              = (0.05% + 0.02%) = 0.07%
```

**Met Market/SL (taker) exit**:
```
Required Move = (0.05% + 0.05%) = 0.10%
```

### Minimum Profit Targets
Aanbevolen minimale profit targets:
- **Scalping (maker exit)**: ≥0.15% (0.07% fees + 0.08% profit)
- **Scalping (taker exit)**: ≥0.25% (0.10% fees + 0.15% profit)
- **Swing trades**: ≥0.50% (fees zijn kleiner deel)

## Technische Details

### Berekening Methode
```typescript
// Trading fee
tradingFee = notionalValue × feeRate

// Notional value  
notionalValue = positionSize × leverage

// Total cost
totalCost = entryFee + exitFee
```

### Fee Types Bepalen
- **Market orders**: Altijd taker (0.05%)
- **Limit orders (TP)**: Maker als order op orderbook staat (0.02%)
- **Stop orders (SL)**: Taker bij trigger (0.05%)

### Settlement Fees
- Alleen bij echte settlement (perpetual expiratie)
- Niet van toepassing op normale closes
- USDC perps: meestal geen settlement fee

## Bronnen

### Officiële Documentatie
- [Deribit Fee Structure](https://www.deribit.com/pages/information/fees)
- [Linear Perpetuals Guide](https://support.deribit.com/hc/en-us/articles/25944738177565-Linear-Perpetual)
- [Order Types](https://docs.deribit.com/)

### Support
Voor vragen over cost analysis:
1. Check deze documentatie
2. Test met kleine bedragen eerst
3. Gebruik testnet om vertrouwd te raken

## Updates

**Versie 1.0**:
- Basis cost analysis voor 3 exit scenarios
- Complete trade cost berekening
- Leverage impact visualisatie
- Deribit fee structure integratie

---

**Let op**: Deze tool gebruikt de standaard Deribit fee structure. Fee tiers voor hoge volumes worden niet meegenomen in de berekening. Check je actuele fees in je Deribit account instellingen.
