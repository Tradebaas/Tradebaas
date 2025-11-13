# Developer Onboarding Guide - Tradebaas

**Welkom bij het Tradebaas development team!**

Deze guide helpt je om snel productief te worden met de codebase.

---

## 📅 Week 1: Basis Setup & Begrip

### Dag 1: Environment Setup

**Taken:**
1. Clone repository
2. Install dependencies: `npm install`
3. Setup Deribit testnet account (https://test.deribit.com)
4. Create API keys (Read + Trade permissions)
5. Start dev server: `npm run dev`
6. Connect in UI met testnet credentials

**Checklist:**
- [ ] App draait op localhost:5000
- [ ] Testnet connection succesvol
- [ ] Balance wordt getoond
- [ ] Test order plaatsing werkt

### Dag 2: Codebase Verkenning

**Taken:**
1. Lees `TECHNICAL_DOCS.md` volledig door
2. Bekijk `ARCHITECTURE_OVERVIEW.md`
3. Verken file structure in `src/`
4. Open en lees:
   - `src/App.tsx`
   - `src/state/store.ts`
   - `src/lib/deribitClient.ts`
   - `src/lib/riskEngine.ts`

**Oefening:**
- Plaats een breakpoint in `connect()` functie
- Stap door het connection proces
- Observeer state changes in Zustand DevTools

### Dag 3: Components & UI

**Taken:**
1. Verken component structure
2. Bekijk shadcn/ui components in `src/components/ui/`
3. Analyseer main components:
   - `StrategyTradingCard.tsx`
   - `SettingsDialog.tsx`
   - `MetricsPage.tsx`
4. Run storybook (indien beschikbaar)

**Oefening:**
- Voeg een nieuwe status indicator toe aan StatusPill
- Pas de kleur van een button aan via Tailwind
- Maak een nieuwe test dialog component

### Dag 4: State Management

**Taken:**
1. Deep dive in `src/state/store.ts`
2. Begrijp Zustand patterns
3. Trace een complete flow:
   - User klikt "Connect"
   - Credentials validation
   - WebSocket connection
   - State update
   - UI render
4. Bekijk useKV hook voor persistence

**Oefening:**
- Add een nieuwe state property
- Create een nieuwe store action
- Persist een nieuwe setting met useKV

### Dag 5: Testing & Review

**Taken:**
1. Run tests: `npm test`
2. Bekijk test structure in `src/tests/`
3. Lees een paar test files:
   - `risk/percentSizing.spec.ts`
   - `bracket/advancedBracket.spec.ts`
4. Write een simpele test

**Oefening:**
- Schrijf een test voor een utility functie
- Run test coverage: `npm run test:coverage`
- Fix een failing test (indien aanwezig)

---

## 📅 Week 2: Features & Integration

### Dag 6-7: Broker System

**Taken:**
1. Bestudeer `IBroker` interface
2. Analyseer `DeribitBroker.ts` implementatie
3. Bekijk broker registry en metadata
4. Trace een order placement flow

**Oefening:**
- Implement een stub voor een nieuwe broker
- Test broker connection flow
- Add broker metadata voor nieuwe broker

### Dag 8-9: Risk Engine

**Taken:**
1. Deep dive `riskEngine.ts`
2. Begrijp position sizing formulas
3. Trace calculation flow met verschillende settings
4. Bekijk validation logic

**Oefening:**
- Calculate position size manually
- Verify calculation matches code
- Test edge cases (min amount, max leverage)
- Add een warning condition

### Dag 10: Strategy System

**Taken:**
1. Analyseer Strategy interface
2. Bekijk `ScalpingStrategy.ts` volledig
3. Trace strategy lifecycle:
   - Start → Monitor → Signal → Entry → Exit
4. Begrijp indicator calculations

**Oefening:**
- Modify een strategy parameter
- Add een nieuwe indicator
- Test strategy in testnet
- Monitor strategy error logs

---

## 📅 Week 3: Advanced Topics

### Dag 11-12: Order Management

**Taken:**
1. Deep dive `AdvancedBracketManager.ts`
2. Begrijp OTOCO order logic
3. Trace bracket lifecycle:
   - Initial placement
   - TP1 fill detection
   - SL to BE movement
   - Trailing stop updates
4. Bekijk state recovery logic

**Oefening:**
- Test bracket orders in testnet
- Simulate TP1 fill manually
- Verify SL moves to BE
- Test trailing logic

### Dag 13: Error Handling

**Taken:**
1. Bekijk error types en handling patterns
2. Analyseer ErrorDetailsDialog component
3. Trace error flow van API → Store → UI
4. Review telemetry hooks

**Oefening:**
- Trigger verschillende error types
- View errors in ErrorDetailsDialog
- Add een nieuwe error type
- Improve een error message

### Dag 14-15: License & Security

**Taken:**
1. Bestudeer license system
2. Bekijk encryption implementation
3. Analyseer credential storage
4. Review security best practices

**Oefening:**
- Test license verification flow
- Review encrypted data format
- Audit een component voor security issues
- Document security considerations

---

## 📅 Week 4: Contribution

### Dag 16-17: First Feature

**Taken:**
1. Pick een small feature from backlog
2. Design solution
3. Implement feature
4. Write tests
5. Update documentation

**Checklist:**
- [ ] Feature branch created
- [ ] Code implements requirements
- [ ] Tests pass
- [ ] No TypeScript errors
- [ ] Documentation updated
- [ ] PR ready for review

### Dag 18: Code Review

**Taken:**
1. Participate in team code reviews
2. Learn review process
3. Address review feedback
4. Merge eerste PR

### Dag 19-20: Bug Fixes

**Taken:**
1. Pick bugs from issue tracker
2. Reproduce bug
3. Root cause analysis
4. Implement fix
5. Add regression test

---

## 🎓 Learning Resources

### Must-Read Documentation

1. **Project Docs** (in order)
   - `TECHNICAL_DOCS.md` - Complete technical overview
   - `ARCHITECTURE_OVERVIEW.md` - Quick reference
   - `README_DEV.md` - Strategy & development details
   - `RISK_ENGINE.md` - Risk calculation specifics
   - `BROKER_API.md` - Broker integration
   - `TESTING.md` - Test strategy

2. **External Docs**
   - [Deribit API](https://docs.deribit.com)
   - [Zustand](https://docs.pmnd.rs/zustand)
   - [shadcn/ui](https://ui.shadcn.com)
   - [Tailwind CSS v4](https://tailwindcss.com/docs)

### Code Patterns to Learn

**State Updates (Zustand)**
```typescript
// ❌ Wrong - Direct mutation
set({ balance: balance + 100 });

// ✅ Correct - Immutable update
set((state) => ({ balance: state.balance + 100 }));
```

**KV Storage**
```typescript
// ❌ Wrong - Stale closure
const [value, setValue] = useKV('key', 0);
setValue(value + 1); // value might be stale!

// ✅ Correct - Functional update
setValue((current) => current + 1);
```

**Error Handling**
```typescript
// ❌ Wrong - Generic error
throw new Error('Failed');

// ✅ Correct - Typed error with context
const error: ErrorLog = {
  id: `error-${Date.now()}`,
  timestamp: Date.now(),
  errorType: 'INVALID_PARAMS',
  message: 'Amount must be multiple of contract size',
  context: { amount, contractSize }
};
addErrorLog(error);
```

**Async Actions**
```typescript
// ❌ Wrong - Unhandled promise
connect(credentials); // Fire and forget

// ✅ Correct - Handle errors
try {
  await connect(credentials);
  toast.success('Connected');
} catch (error) {
  toast.error('Connection failed');
  addErrorLog(error);
}
```

---

## 🔍 Code Navigation Tips

### Find Where Feature is Implemented

**User clicks "Connect" button:**
1. Search for "Connect" button: `SettingsDialog.tsx`
2. Find onClick handler: `handleConnect`
3. Trace to store action: `useTradingStore().connect()`
4. Implementation: `src/state/store.ts` → `connect()`
5. Broker logic: `src/lib/brokers/DeribitBroker.ts`

**Strategy execution:**
1. Entry point: `StrategyTradingCard.tsx` → "Start" button
2. Store action: `startStrategy(strategyId)`
3. Strategy creation: `src/state/store.ts` switch statement
4. Implementation: `src/lib/strategies/thirdIterationStrategy.ts`
5. Order placement: `AdvancedBracketManager.ts`

### Common Search Queries

**Find all error handling:**
```bash
grep -r "addErrorLog" src/
```

**Find all KV storage usage:**
```bash
grep -r "useKV" src/
```

**Find all broker API calls:**
```bash
grep -r "client\." src/lib/brokers/
```

**Find all state updates:**
```bash
grep -r "set({" src/state/
```

---

## 🐛 Debugging Guide

### Enable Verbose Logging

1. Open SettingsDialog
2. Go to Privacy tab
3. Enable Telemetry
4. Check browser console for detailed logs

### Debug WebSocket Messages

```typescript
// In deribitClient.ts, add:
ws.onmessage = (event) => {
  console.log('[WS IN]', JSON.parse(event.data));
  // ... rest of handler
};
```

### Debug State Changes

```typescript
// In store.ts, add middleware:
const logMiddleware = (config) => (set, get, api) =>
  config(
    (args) => {
      console.log('State before:', get());
      set(args);
      console.log('State after:', get());
    },
    get,
    api
  );
```

### Common Issues & Solutions

**Issue: "WebSocket connection failed"**
- Check network/firewall
- Verify API credentials
- Try testnet first
- Check browser console for CORS errors

**Issue: "Invalid params" on order**
- Log order params before sending
- Verify amount calculation
- Check tick/lot rounding
- Review broker rules

**Issue: "Strategy not executing"**
- Enable telemetry
- Check signal conditions
- Verify risk calculation
- Check circuit breakers (daily limits)

**Issue: "State not persisting"**
- Verify useKV usage
- Check localStorage quota
- Test in incognito (clean state)

---

## ✅ Code Quality Standards

### Before Committing

- [ ] No TypeScript errors: `npm run type-check`
- [ ] Tests pass: `npm test`
- [ ] Linter clean: `npm run lint`
- [ ] Formatted: `npm run format`
- [ ] Build succeeds: `npm run build`

### Code Review Checklist

**Functionality:**
- [ ] Feature works as expected
- [ ] Edge cases handled
- [ ] Error handling present
- [ ] No console errors/warnings

**Code Quality:**
- [ ] DRY (Don't Repeat Yourself)
- [ ] Clear variable names
- [ ] Functions < 50 lines
- [ ] Complexity manageable

**Testing:**
- [ ] Unit tests added/updated
- [ ] Test coverage maintained
- [ ] Edge cases tested

**Documentation:**
- [ ] JSDoc for public APIs
- [ ] README updated if needed
- [ ] Complex logic commented

**Security:**
- [ ] No credentials in code
- [ ] Input validation present
- [ ] No XSS vulnerabilities

---

## 🚀 Next Steps

### After Month 1

**Skills to develop:**
- [ ] Can implement feature end-to-end
- [ ] Can debug production issues
- [ ] Can review others' code
- [ ] Understand trading concepts
- [ ] Comfortable with WebSocket debugging

**Suggested projects:**
- Implement a new indicator
- Add a new strategy
- Improve error messages
- Optimize performance bottleneck
- Write integration test

### Mentorship

**Assigned mentor:** [Team Lead]  
**Weekly 1-on-1:** [Schedule]  
**Code review buddy:** [Peer]

### Questions?

- Ask in team chat
- Review existing docs
- Check error logs
- Pair program with mentor

---

**Welcome to the team! 🎉**

*Last updated: Iteratie 85*
