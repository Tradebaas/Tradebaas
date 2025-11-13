# Tradebaas - Documentatie Index

**Complete overzicht van alle technische documentatie**

---

## 📖 Documentatie Structuur

Deze repository bevat uitgebreide documentatie voor alle aspecten van de Tradebaas trading platform. Begin met het document dat het beste past bij jouw rol en doelen.

---

## 🎯 Waar moet ik beginnen?

### Als je nieuw bent (Developer Onboarding)
→ **[DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md)**
- Week-by-week onboarding plan
- Hands-on oefeningen
- Code patterns & best practices
- Debugging tips

### Als je code gaat schrijven of refactoren (VERPLICHT)
→ **[../MASTER.md](../MASTER.md) - Sectie 6: Code Kwaliteit & Maintenance Regels**
- Mappenstructuur regels (KRITISCH)
- Test maintenance procedures
- TypeScript striktness
- Tech debt preventie
- Refactoring workflow
- Production readiness criteria

### Als je een quick reference nodig hebt
→ **[ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)**
- High-level architectuur
- Key interfaces & types
- Common operations
- Quick troubleshooting

### Als je de volledige technische details wilt
→ **[TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)**
- Complete systeem documentatie
- Alle componenten in detail
- API reference
- Security & deployment

### Als je aan strategieën werkt
→ **[README_DEV.md](./README_DEV.md)**
- Strategy development guide
- Vortex Strategy details
- Indicator calculations
- Testing procedures

---

## 📋 Alle Documentatie Bestanden

### Core Documentatie

| Document | Beschrijving | Wanneer gebruiken |
|----------|--------------|-------------------|
| **[README.md](./README.md)** | Project overview & quick start | Eerste kennismaking |
| **[../MASTER.md](../MASTER.md)** | **Functioneel overzicht + CODE REGELS** | **VERPLICHT voor alle wijzigingen** |
| **[TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)** | Volledige technische documentatie | Complete systeem begrip |
| **[ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)** | Architectuur & quick reference | Dagelijks werk & debugging |
| **[DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md)** | Onboarding guide | Nieuwe developers |

### Code Kwaliteit & Cleanup (November 2025)

| Document | Focus | Details |
|----------|-------|---------|
| **[cleanup/TEST_CLEANUP_COMPLETE.md](./cleanup/TEST_CLEANUP_COMPLETE.md)** | Test fixes overzicht | 40 failures → 0 failures |
| **[cleanup/ITERATION_3_COMPLETE.md](./cleanup/ITERATION_3_COMPLETE.md)** | Backend test improvements | Mock setup, fake timers |
| **[cleanup/ITERATION_4_COMPLETE.md](./cleanup/ITERATION_4_COMPLETE.md)** | Root directory cleanup | 25 → 11 files |
| **[cleanup/ROOT_LAYOUT_DECISIONS.md](./cleanup/ROOT_LAYOUT_DECISIONS.md)** | Mappenstructuur rationale | Waarom files waar staan |
| **[cleanup/TYPESCRIPT_ERRORS_FIXED.md](./cleanup/TYPESCRIPT_ERRORS_FIXED.md)** | TypeScript error fixes | Interface compliance |
| **[cleanup/MASTER_UPDATE_NOV_2025.md](./cleanup/MASTER_UPDATE_NOV_2025.md)** | MASTER.md update samenvatting | Nieuwe Sectie 6 uitleg |

### Specialized Documentatie

| Document | Focus Area | Details |
|----------|------------|---------|
| **[README_DEV.md](./README_DEV.md)** | Strategy development | Vortex Strategy, indicators, tests |
| **[RISK_ENGINE.md](./RISK_ENGINE.md)** | Risk management | Position sizing, broker rules, validation |
| **[BROKER_API.md](./BROKER_API.md)** | Broker integration | Multi-broker support, API specifics |
| **[LICENSE_SERVICE.md](./LICENSE_SERVICE.md)** | License & entitlement | IAP, tiers, verification |
| **[TESTING.md](./TESTING.md)** | Test strategy | Unit tests, integration tests, mocking |
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Deployment | Docker, K8s, production setup |
| **[SECURITY.md](./SECURITY.md)** | Security practices | Encryption, credentials, best practices |

### Implementation Details

| Document | Specifiek Onderwerp |
|----------|---------------------|
| **[AMOUNT_VALIDATION.md](./AMOUNT_VALIDATION.md)** | Order amount validation & rounding |
| **[OTOCO_FIX.md](./OTOCO_FIX.md)** | OTOCO bracket order implementation |
| **[PERSISTENCE.md](./PERSISTENCE.md)** | State persistence & recovery |
| **[FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)** | Frontend-backend integration |
| **[APP_STORE_COMPLIANCE.md](./APP_STORE_COMPLIANCE.md)** | App Store requirements |
| **[COST_ANALYSIS.md](./COST_ANALYSIS.md)** | Trading cost analysis voor exit scenarios |
| **[COST_QUICK_REFERENCE.md](./COST_QUICK_REFERENCE.md)** | Quick reference voor trading fees |

### Project Management

| Document | Doel |
|----------|------|
| **[PRD.md](./PRD.md)** | Product Requirements Document |

---

## 🗺️ Documentatie Roadmap

### Voor verschillende use cases:

#### "Ik wil een nieuwe feature bouwen"
1. [../MASTER.md](../MASTER.md) - **SECTIE 6: Lees code regels eerst!**
2. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - Begrijp de architectuur
3. [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - Vind relevante componenten
4. [TESTING.md](./TESTING.md) - Schrijf tests
5. [README_DEV.md](./README_DEV.md) - Update development docs

#### "Ik wil een bug fixen"
1. [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - Quick troubleshooting
2. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - Dieper begrip van component
3. Error logs in applicatie
4. [TESTING.md](./TESTING.md) - Voeg regression test toe
5. [../MASTER.md](../MASTER.md) - **Check 6.2 test maintenance regels**

#### "Ik wil refactoren"
1. [../MASTER.md](../MASTER.md) - **SECTIE 6.8: Refactoring Workflow (VERPLICHT)**
2. [cleanup/ROOT_LAYOUT_DECISIONS.md](./cleanup/ROOT_LAYOUT_DECISIONS.md) - Mappenstructuur beslissingen
3. Grep search voor alle referenties
4. Update & valideer (build + tests)
5. Documenteer in iteration report

#### "Ik wil een nieuwe broker toevoegen"
1. [BROKER_API.md](./BROKER_API.md) - Broker integration guide
2. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - IBroker interface
3. [RISK_ENGINE.md](./RISK_ENGINE.md) - Broker rules implementation
4. [TESTING.md](./TESTING.md) - Test broker implementation

#### "Ik wil een nieuwe strategy maken"
1. [README_DEV.md](./README_DEV.md) - Strategy guide
2. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - Strategy interface
3. [RISK_ENGINE.md](./RISK_ENGINE.md) - Risk integration
4. [TESTING.md](./TESTING.md) - Strategy tests

#### "Ik wil de app deployen"
1. [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment procedures
2. [SECURITY.md](./SECURITY.md) - Security checklist
3. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - Environment config
4. [TESTING.md](./TESTING.md) - Pre-deployment tests

---

## 📊 Documentatie per Component

### Frontend

**UI Components**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#frontend-structuur)
- App.tsx
- StrategyTradingCard
- SettingsDialog
- MetricsPage

**State Management**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#state-management)
- Zustand store
- useKV persistence
- Actions & selectors

**Hooks**: [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
- useBrokers
- useLicense
- useBackend

### Backend

**API Routes**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#backend-structuur)
- Broker endpoints
- License endpoints
- Strategy endpoints

**Services**: [LICENSE_SERVICE.md](./LICENSE_SERVICE.md), [BROKER_API.md](./BROKER_API.md)
- License service
- Strategy runner
- Orchestrator

### Core Libraries

**Broker System**: [BROKER_API.md](./BROKER_API.md)
- IBroker interface
- DeribitBroker implementation
- BrokerRegistry

**Risk Engine**: [RISK_ENGINE.md](./RISK_ENGINE.md)
- calculatePosition
- buildBracket
- Validation logic

**Strategy System**: [README_DEV.md](./README_DEV.md)
- Strategy interface
- ScalpingStrategy
- Vortex (ThirdIterationStrategy)
- AdvancedBracketManager

**Order Management**: [OTOCO_FIX.md](./OTOCO_FIX.md)
- AdvancedBracketManager
- Bracket lifecycle
- State recovery

---

## 🔍 Zoeken in Documentatie

### Per Feature

- **Connection Management**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#broker-integratie)
- **Risk Calculation**: [RISK_ENGINE.md](./RISK_ENGINE.md)
- **Cost Analysis**: [COST_ANALYSIS.md](./COST_ANALYSIS.md)
- **Strategy Execution**: [README_DEV.md](./README_DEV.md#vortex-strategy--advancedbracketmanager)
- **Order Placement**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#order-management)
- **License Verification**: [LICENSE_SERVICE.md](./LICENSE_SERVICE.md)
- **Error Handling**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#error-handling)
- **Testing**: [TESTING.md](./TESTING.md)
- **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)

### Per Error Type

- **Connection Errors**: [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md#troubleshooting)
- **Order Validation**: [AMOUNT_VALIDATION.md](./AMOUNT_VALIDATION.md)
- **OTOCO Issues**: [OTOCO_FIX.md](./OTOCO_FIX.md)
- **License Errors**: [LICENSE_SERVICE.md](./LICENSE_SERVICE.md)

### Per API

- **Deribit API**: [BROKER_API.md](./BROKER_API.md), DeribitClient source
- **Backend API**: [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)
- **License API**: [LICENSE_SERVICE.md](./LICENSE_SERVICE.md)

---

## 🎓 Learning Path

### Beginner (Week 1-2)
1. [README.md](./README.md) - Project overview
2. [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Day 1-10
3. [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - System understanding
4. Hands-on: Connect to testnet, place test orders

### Intermediate (Week 3-4)
1. [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) - Deep dive
2. [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Day 11-20
3. [README_DEV.md](./README_DEV.md) - Strategy development
4. Hands-on: Modify strategy, add indicator

### Advanced (Month 2+)
1. [RISK_ENGINE.md](./RISK_ENGINE.md) - Risk system mastery
2. [BROKER_API.md](./BROKER_API.md) - Multi-broker expertise
3. [DEPLOYMENT.md](./DEPLOYMENT.md) - Production knowledge
4. Hands-on: Implement new broker, optimize performance

---

## 🛠️ Maintenance Guide

### Documentatie Updates

Bij code changes, update relevante docs:

| Code Change | Update Deze Docs |
|-------------|------------------|
| Nieuwe component | [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) frontend section |
| Nieuwe strategy | [README_DEV.md](./README_DEV.md) + [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) |
| Nieuwe broker | [BROKER_API.md](./BROKER_API.md) + [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) |
| API endpoint | [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) API section |
| Risk calculation | [RISK_ENGINE.md](./RISK_ENGINE.md) |
| Cost analysis | [COST_ANALYSIS.md](./COST_ANALYSIS.md) |
| Test coverage | [TESTING.md](./TESTING.md) |
| Deployment procedure | [DEPLOYMENT.md](./DEPLOYMENT.md) |
| Security change | [SECURITY.md](./SECURITY.md) |

### Documentatie Review Checklist

- [ ] Technisch accuraat
- [ ] Code voorbeelden werken
- [ ] Links kloppen
- [ ] Versie up-to-date
- [ ] No confidential info
- [ ] Readable formatting
- [ ] Comprehensive coverage

---

## 🔗 Quick Links

### Externe Resources
- [Deribit API Documentation](https://docs.deribit.com)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Vitest Testing](https://vitest.dev)

### Repository Locations
- **Source Code**: `/workspaces/spark-template/src/`
- **Tests**: `/workspaces/spark-template/src/tests/`
- **Backend**: `/workspaces/spark-template/backend/`
- **Documentation**: `/workspaces/spark-template/*.md`

---

## ❓ FAQ

**Q: Welke documentatie moet ik eerst lezen?**  
A: Afhankelijk van je rol:
- Developer: Start met [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md)
- Architect: Begin met [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md)
- Quick help: Gebruik [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)

**Q: Waar vind ik code voorbeelden?**  
A: In alle docs, plus:
- [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - Common operations
- [RISK_ENGINE.md](./RISK_ENGINE.md) - Risk calculations
- Source code comments

**Q: Hoe update ik documentatie?**  
A: Edit markdown bestanden, follow formatting conventions, update version numbers

**Q: Is er een changelog?**  
A: Check Git history en [PRD.md](./PRD.md) voor iteration history

---

## 📞 Support

- **Technical Issues**: Check [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) troubleshooting
- **Code Questions**: Review [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md)
- **Bugs**: Use error logging system + [TESTING.md](./TESTING.md)
- **Feature Requests**: Update [PRD.md](./PRD.md)

---

**Documentation Version**: 1.0  
**Last Updated**: Iteration 85  
**Status**: Complete & Current

*Deze index wordt automatisch gegenereerd en moet up-to-date gehouden worden bij elke iteratie.*
