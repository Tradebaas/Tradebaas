# Volledige Analyse – Tradebaas Backup & Monster Repositories

Dit document bevat **alleen de analyse** van beide projecten (zonder de prompt).  
De focus ligt op de **nieuwe backup-versie**; de Monster-versie dient als referentie voor OTOCO-gedrag en PM2-setup.

---

## 1. OTOCO / SL & TP Gedrag

### Huidige implementatie
- In de backup-versie wordt een entry-order geplaatst met een `otoco_config` array (SL + TP).
- Deribit zou normaal bij het raken van TP automatisch de SL-order cancelen.
- In de huidige implementatie wordt alleen **vertrouwd op Deribit**.

### Problemen
- In sommige situaties blijft een SL order toch open staan.
- Er is geen backend cleanup-laag na het sluiten van een positie.

### Wat nodig is
1. Na sluiting van een positie in `RazorExecutor.checkPositionAndResume()`:
   - Open orders opnieuw ophalen.
   - Alle reduce_only SL/TP orders die niet meer bij een open positie horen expliciet annuleren.
2. Optioneel:
   - `ocoGroupId` opslaan om alle gerelateerde orders in één keer op te schonen.

---

## 2. Trade Data, OrderID Koppeling & Database Opslag

### Huidige situatie
- TradeHistoryService bestaat en slaat trades op.
- Velden als `slOrderId` en `tpOrderId` bestaan in de interface.
- Maar in de praktijk worden deze **niet gevuld**.
- Opslag is via **in-memory Map**, dus niet persistent.
- Metrics UI gebruikt `/api/trades/history`, maar toont niet alle gewenste metadata.

### Problemen
- Je ziet geen volledige koppeling tussen:
  - entry order
  - SL/TP orders
  - strategie
  - resultaat
- Bij een restart gaat alle geschiedenis verloren.

### Wat nodig is
1. Echte database opslag: SQLite of PostgreSQL.
2. Implementatie van een pluggable store:
   - `KvTradeHistoryStore` (bestaand)
   - `SqlTradeHistoryStore` (nieuw)
3. Bij het registreren van een trade:
   - entry, SL, TP IDs opslaan **direct** na verificatie.
4. frontend metrics uitbreiden zodat alle order IDs en resultaten zichtbaar worden.

---

## 3. Strategy Card, Statuslogica & 24/7 Gedrag

### Huidige situatie

#### Backend:
- `StrategyManager`, `strategy-service`, en `state-manager` beheren de lifecycle.
- `RazorExecutor` bevat een auto-resume mechanisme bij sluiten van posities.
- Backend mag **niet** automatisch starten bij server-restart – dat klopt al.

#### Frontend:
- `use-backend-strategy-status.ts` bepaalt `isRunning`, `hasOpenPosition`, `orphanedPosition`.
- Strategy card doet eigen mapping naar:
  - Gestopt
  - Actief
  - Gepauzeerd (Positie open)
  - Error

### Problemen
- Soms toont de kaart "Gestopt" terwijl een positie open staat → moet "Gepauzeerd" zijn.
- Soms stopt de strategy helemaal als een positie sluit → mag **niet**.
- De backend kan de strategy state op "stopped" zetten terwijl er nog een positie is.

### Wat nodig is
1. **Single source of truth** voor:
   - draait de strategy?
   - staat er een positie open?
2. In backend:
   - Alleen handmatig stoppen mag een strategy écht stoppen.
   - Nooit automatisch "stopped" zetten bij open positie of cooldown.
3. In frontend:
   - orphanedPosition → **altijd** "Gepauzeerd (Positie open)".
   - isRunning + open position → "Gepauzeerd".
   - isRunning + geen positie → "Actief".
4. Orphan positie detectie:
   - Voor een nieuwe trade controleren dat er geen orphan positie is.
   - Zo wel → error gooien.

---

## 4. Backend & Frontend 24/7 Draaiend

### Huidige situatie
- Backup repo heeft wél Dockerfiles maar geen PM2 config.
- Monster repo bevat PM2 ecosystem file dat wél werkt.

### Problemen
- Backup-versie draait niet automatisch 24/7.
- Geen duidelijk procesbeheer voor crashes of restarts.

### Wat nodig is
1. Nieuw PM2 ecosysteembestand toevoegen aan de backup-repo:
   - Eén proces voor backend
   - Eén proces voor frontend
2. VPS:
   - `pm2 start`
   - `pm2 save`
   - `pm2 startup`
3. Optie voor Docker-compose als alternatief.

---

## 5. Subdomein / Hosting

### Wat nodig is
- A-records instellen:
  - `api.tradebazen.nl` → VPS IP
  - `app.tradebazen.nl` → VPS IP
- Reverse proxy instellen:
  - frontend → 5000
  - backend → 3000
- HTTPS via Let's Encrypt.

---

## 6. Acceptatiecriteria (Samenvatting)

- Geen achterblijvende SL na TP hit.
- Complete trade metadata: entry, SL, TP, strategy, resultaat.
- Persistent, querybare database.
- Strategy card toont altijd juiste status.
- Tool stopt alleen bij:
  - handmatige stop
  - broker disconnect
  - dwingende error (zoals orphan positie)
- Backend & frontend draaien 24/7 via PM2 of Docker.

---

Einde analyse.
