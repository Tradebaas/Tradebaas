# 🚀 Go-Live Checklist (v1)

Datum: 2025-09-17
Scope: Eerste futures-strategie live op Deribit (USDC perpetuals) + 24/7 operatie.

---

## 1. Accounts & Toegang
- [ ] Deribit API credentials (client_id/secret) in `.env.local` en productie secret store
- [ ] API-scope geverifieerd (trading, account, read)
- [ ] IP-whitelisting (indien geconfigureerd) geverifieerd
- [ ] 2FA/Account beveiliging gecontroleerd

## 2. Omgeving & Config
- [ ] Mode default = Live (gevalideerd in UI)
- [ ] Deribit ENV = production (geen testnet) voor live
- [ ] Rate limiting en backoff ingesteld in client
- [ ] Logging niveau: info in prod, debug lokaal

## 3. Veiligheid & Noodprocedures
- [ ] Global STOP: annuleert alle open orders + sluit alle posities (gevalideerd)
- [ ] Per-bot STOP: sluit positie voor betreffende bot (gevalideerd)
- [ ] START: herstart alle/één bot (gevalideerd)
- [ ] Bevestigingsmodals en resultaatfeedback tonen duidelijk
- [ ] Failsafe: geen live calls in demo-modus

## 4. Strategie & Instrumenten
- [ ] Voor iedere bot: instrument_name bekend (bv. BTC-PERPETUAL, ETH-PERPETUAL)
- [ ] Positiesluiting test: limit/market parameters gevalideerd
- [ ] Orderplaatsing disabled voor deze release (alleen monitoren), of duidelijk toegelaten met limieten
- [ ] Position sizing en leverage parameters gedocumenteerd

## 5. Monitoring & Alerts
- [ ] Health endpoint/Heartbeat (connectivity checks) werkt
- [ ] Error logging + stack traces zichtbaar
- [ ] Alerting: e-mail/Slack bij errors of STOP events (optioneel v1)
- [ ] Uptime monitoring (ping) actief

## 6. Telemetrie & Metrics
- [ ] Equity (USDC) realtime getoond (OK)
- [ ] PnL/Winrate/Drawdown voorlopig demo; plan voor live metrics vastgelegd
- [ ] Last Updated UI zichtbaar en klopt

## 7. Runbooks
- [ ] Noodstop: stappenplan (UI knop + controle in logs)
- [ ] Herstart: START all/bot, verwachte status in UI
- [ ] Incident triage: waar te kijken (API logs, UI modals, /api/deribit/debug)
- [ ] Rollback plan: toggle naar DEMO, switch naar testnet indien nodig

## 8. Testen voor live
- [ ] Smoke test: balance ophalen (200 OK, equity > 0 of verwacht)
- [ ] Demo-mode sanity (geen netwerkcalls, statische data)
- [ ] STOP All in testomgeving (geen echte posities) – respons valide
- [ ] Per-bot STOP route met dummy instrument (validatie 200/4xx-handling)

## 9. Launch
- [ ] Change window en communicatie afgestemd
- [ ] Stakeholders op de hoogte (kanaal + draaiboek)
- [ ] Eerste monitoring 2u na launch gepland

## 10. Post-launch
- [ ] Review incidenten/telemetrie
- [ ] Backlog items aanmaken voor verbeteringen (metrics live, alerts, tests)
- [ ] Documentatie bijwerken

---

Owner: Product/Tech
Versie: 1.0
