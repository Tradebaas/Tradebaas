# MASTER.md Update - November 2025

## Samenvatting
MASTER.md is bijgewerkt met een complete **Sectie 6: Code Kwaliteit & Maintenance Regels** die alle beslissingen, best practices en regels vastlegt die we tijdens de cleanup hebben toegepast.

## Belangrijkste Toevoegingen

### 6.1 Mappenstructuur & Organisatie
- **Root Directory Regels**: Max 15 bestanden, alleen tooling essentials
- **Backend Structuur**: Duidelijke scheiding tussen src/, tests/, config/, data/, docker/, etc.
- **Frontend Structuur**: components/, hooks/, lib/, state/, tests/, types/
- **Documentatie Structuur**: DOCS/ met subcategorieën (ADR/, cleanup/, legacy/, etc.)

**Impact**: Voorkomt toekomstige root directory chaos

### 6.2 Test Maintenance Regels
- **Test Status Categorieën**: PASS, SKIP (met reden), NEVER FAIL
- **Skip Documentatie Template**: Verplicht format met reden, TODO, context
- **Skip Categorieën**: Outdated Implementation, Future Hardening, Complex Setup, Race Conditions
- **Test Principes**: Mock cleanup, fake timers cleanup, exacte type assertions

**Impact**: 252 passing tests, 82 strategisch geskipped, 0 failures behouden

### 6.3 TypeScript Striktness
- **Zero Tolerance**: 0 TS errors, 0 @ts-ignore zonder comment, 0 any in production
- **Interface Compliance**: Alle implementations volledig, inclusief mocks
- **Type Safety in Tests**: Exacte type matching (bijv. 'take_limit' vs 'limit')

**Impact**: 100% type-safe codebase

### 6.4 Tech Debt Preventie
- **Nul Tolerantie**: Duplicaat code, dead code, commented code, console.logs
- **Code Review Checklist**: 6 verplichte checks voor elke commit

**Impact**: Voorkomt tech debt accumulatie

### 6.5 Deployment & State Management
- **State Files Locaties**: Exacte paden (state/backend-state.json, etc.)
- **Config Files**: PM2, runtime, Spark
- **Scripts Organisatie**: Root vs backend scripts
- **Docker & K8s**: Deploy locaties

**Impact**: Consistente deployment structure

### 6.6 Documentation Standards
- **Iteration Reports**: Verplicht voor major changes
- **Decision Documentation**: Voor structurele wijzigingen
- **MASTER.md Updates**: Voor architectuur wijzigingen

**Impact**: Beslissingen blijven traceerbaar

### 6.7 Production Readiness Criteria
- **Checklist van 15 items** die ALLEMAAL groen moeten zijn
- Van tests tot security tot monitoring

**Impact**: Voorkomt half-baked deployments

### 6.8 Refactoring Workflow
- **4-stappen proces**: Grep → Impact → Update → Document
- **Volgorde**: Tests eerst, dan move, dan cleanup, validatie na elke stap

**Impact**: Veilige refactoring zonder breaking changes

### 6.9 Git & Version Control
- **Commit Guidelines**: Atomic commits, descriptive messages
- **Branch Strategy**: main/develop/feature/fix/refactor
- **Never Commit**: Lijst van 8 categorieën

**Impact**: Schone git history

### 6.10 Performance & Optimization
- **Backend Performance**: Rate limits, in-memory aggregation, log rotation
- **Frontend Performance**: Lazy loading, debouncing, memoization
- **Memory Management**: Limits op history, circular buffers, cleanup

**Impact**: Schaalbare applicatie

## Andere Updates

### Sectie 2.2 - State Manager
- Toegevoegd: Exacte locatie state file (`state/backend-state.json`)
- Toegevoegd: Vite watch exclude uitleg

### Sectie 5.1 - Tests
- **Status bijgewerkt**: 252 passing, 82 skipped, 0 failures
- **Test files lijst**: Alle backend test files gedocumenteerd
- **Skip Categories**: Breakdown van 82 skipped tests
- **Test Rapportage**: Links naar cleanup documentatie

### Inleiding
- **Waarschuwing toegevoegd**: Sectie 6 is VERPLICHT te lezen voor wijzigingen

## Waarom Deze Update Kritisch Is

### Voor AI Agents
- **Consistentie**: Alle toekomstige agents krijgen dezelfde regels
- **Kwaliteit**: Voorkomt regressie naar oude chaos
- **Traceerbaarheid**: Beslissingen blijven gedocumenteerd

### Voor Developers
- **Onboarding**: Nieuwe developers weten exact wat de regels zijn
- **Code Review**: Objectieve criteria voor pull requests
- **Refactoring**: Veilig proces voor grote wijzigingen

### Voor Codebase
- **Maintainability**: Blijft schoon en georganiseerd
- **Scalability**: Groeit op gecontroleerde manier
- **Production-Ready**: Blijft deployable

## Hoe Te Gebruiken

### Voordat Je Code Schrijft
1. Lees MASTER.md Sectie 6
2. Check welke regels van toepassing zijn
3. Plan je wijzigingen volgens workflow

### Tijdens Code Review
1. Gebruik 6.4 Code Review Checklist
2. Check 6.7 Production Readiness (voor releases)
3. Verify 6.9 Git guidelines (commits)

### Bij Refactoring
1. Volg 6.8 Refactoring Workflow EXACT
2. Documenteer in iteration report
3. Update MASTER.md indien structureel

## Gerelateerde Documenten

- `DOCS/cleanup/TEST_CLEANUP_COMPLETE.md` - Test fixes die tot regels leidden
- `DOCS/cleanup/ITERATION_3_COMPLETE.md` - Backend test improvements
- `DOCS/cleanup/ITERATION_4_COMPLETE.md` - Root cleanup die tot structuur regels leidde
- `DOCS/cleanup/ROOT_LAYOUT_DECISIONS.md` - Rationale achter mappenstructuur
- `DOCS/cleanup/TYPESCRIPT_ERRORS_FIXED.md` - TypeScript regels in praktijk

## Conclusie

MASTER.md is nu niet alleen een **functioneel overzicht**, maar ook een **levend regelboek** dat:
- ✅ Voorkomt dat we oude fouten herhalen
- ✅ Waarborgt consistente code kwaliteit
- ✅ Maakt onboarding van nieuwe developers/agents eenvoudig
- ✅ Houdt de codebase production-ready

**Versie**: November 2025  
**Status**: ACTIEF - Verplicht voor alle wijzigingen  
**Eigenaar**: Alle contributors moeten deze regels volgen
