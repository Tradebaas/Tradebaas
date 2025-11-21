# App Store Compliance Checklist

This document outlines how Tradebaas meets Apple App Store requirements for trading/financial applications.

## ✅ Compliance Items Implemented

### 1. In-App Purchases & Subscriptions

#### Restore Purchases Button ✅
- **Location**: License Dialog → Products Tab
- **Functionality**: "Herstel Aankopen" button restores previous purchases from Apple
- **Implementation**: `src/components/LicenseDialog.tsx` line 91-97
- **User Flow**: 
  1. Open License dialog from header badge
  2. Navigate to "Products" tab
  3. Click "Herstel Aankopen" button
  4. System checks stored entitlement in KV storage
  5. Shows success/error toast notification

#### Receipt Verification ✅
- **Implementation**: `src/lib/license-service.ts` lines 84-113
- **Admin Tools**: Owner-only receipt verification in License Dialog → Admin tab
- **Webhook Support**: Handles Apple subscription notifications (lines 146-174)

### 2. Legal & Disclaimers

#### Risk Warning Disclaimer ✅
- **Location**: First app launch (mandatory), Settings → Connection (before live mode)
- **Implementation**: `src/components/LegalDisclaimerDialog.tsx`
- **Content Covers**:
  - Trading risks and potential loss of capital
  - No financial advice disclaimer
  - Technical risks (API outages, bugs)
  - Automated trading warnings
  - API security best practices
  - Testnet recommendation
  - Privacy & data handling
  - Liability limitations
- **User Flow - First Run**:
  1. App launches
  2. Checks `first-run-disclaimer-shown` in KV storage
  3. If false, displays mandatory disclaimer dialog
  4. User must click "Ik begrijp de risico's en ga akkoord" to proceed
  5. Flag set to true, never shows automatically again
- **User Flow - Live Mode Switch**:
  1. User attempts to toggle from Testnet to Live in Settings
  2. Checks `legal-disclaimer-accepted` in KV storage
  3. If false, displays disclaimer dialog
  4. User must accept to proceed to live trading
  5. Subsequent toggles skip disclaimer

#### Privacy Policy ✅
- **Locations**: 
  - Footer of main app (always visible)
  - Settings → Privacy tab
  - License Dialog → Products tab → Privacy button
- **Implementation**: `src/components/PrivacyPolicyDialog.tsx`
- **Content Covers**:
  - Data collection practices (minimal)
  - Local vs server storage
  - API key encryption and security
  - Telemetry (opt-in only)
  - Third-party data sharing (Deribit, GitHub, Apple)
  - User rights (access, correction, deletion)
  - GDPR compliance
  - Data retention policies
  - Contact information

### 3. Privacy & Data Collection

#### Telemetry Off by Default ✅
- **Location**: Settings → Privacy tab
- **Implementation**: 
  - `src/components/SettingsDialog.tsx` lines 195-237
  - `src/state/store.ts` lines 79-116 (telemetry hooks with opt-in check)
- **Default State**: Disabled (`telemetry-enabled` = 'false' in KV storage)
- **User Controls**: 
  - Clear toggle switch in Privacy tab
  - Explicit explanation of what IS collected
  - Explicit explanation of what IS NOT collected
- **What Telemetry Collects (when enabled)**:
  - RPC method names and response times (no parameters)
  - WebSocket connection status events
  - Generic error messages (no sensitive data)
  - Order status updates (no prices or amounts)
- **What Is NEVER Collected**:
  - API keys or credentials
  - Order prices or amounts
  - Account balances
  - Personal identification information
  - Any user-entered data

#### Data Encryption ✅
- **API Keys**: AES-256 encryption before storage
- **Implementation**: `src/lib/encryption.ts`
- **Storage**: Local device only via Spark KV API
- **Never Transmitted**: API keys never sent to our servers

### 4. Offline/Local Mode

#### Functional Without Backend ✅
- **Requirement**: App Store reviewers can test without subscribing or connecting to backend
- **Implementation**: All backend calls gracefully handle failures
  - `src/lib/backend-client.ts` - All methods return fallback responses
  - `src/hooks/use-backend.ts` - Handles connection errors gracefully
  - `src/hooks/use-license.ts` - Falls back to 'free' tier on error
- **Available Features Offline**:
  - Full UI navigation (Trading, Metrics, Strategies pages)
  - Settings and configuration
  - Testnet mode (with Deribit API keys)
  - View stored data
  - Privacy policy and legal disclaimers
- **Free Tier Access**: No subscription required for basic usage

### 5. App Store Review Mode

#### Testnet-Only Demo ✅
- **Purpose**: Reviewers can test all features without real money
- **Access**: Settings → Connection → Toggle "Testnet"
- **No Prerequisites**: 
  - No subscription required
  - No backend connection required (graceful fallback)
  - No payment required
- **Full Feature Access**: All UI and trading features work in testnet mode

### 6. User Interface Requirements

#### Clear Tier Indication ✅
- **Location**: Header badge (top right)
- **Shows**: Current subscription tier (FREE/BASIC/PREMIUM/ENTERPRISE)
- **Clickable**: Opens License Dialog for upgrade/management

#### Transparent Pricing ✅
- **Location**: License Dialog → Products Tab
- **Shows**: 
  - Product name
  - Price in USD
  - Duration (days)
  - Tier level
  - Purchase button
- **No Hidden Costs**: All prices shown upfront

#### Terms & Conditions Access ✅
- **Privacy Policy**: 
  - Footer link (always accessible)
  - Settings → Privacy tab
  - License Dialog → Products → Privacy button
- **Risk Disclaimer**: 
  - First run (mandatory)
  - Settings → Connection (before live mode)

## 📋 Testing Checklist for App Store Review

### For Apple Reviewers

1. **Install app without account/subscription**
   - ✅ App launches successfully
   - ✅ Legal disclaimer appears
   - ✅ Can navigate all UI screens
   - ✅ Free tier badge visible

2. **Test in Testnet mode**
   - ✅ Settings → Connection → Enable Testnet
   - ✅ Enter Deribit testnet API credentials (if desired)
   - ✅ Can place test trades
   - ✅ No real money involved

3. **Verify privacy controls**
   - ✅ Settings → Privacy → Telemetry OFF by default
   - ✅ Clear explanation of data collection
   - ✅ Privacy Policy accessible

4. **Check legal compliance**
   - ✅ Risk disclaimer on first run
   - ✅ Risk disclaimer before live mode
   - ✅ Privacy Policy in footer
   - ✅ No financial advice claims

5. **Test restore purchases**
   - ✅ License Dialog → Products → "Herstel Aankopen" button present
   - ✅ Works for users with previous purchases

## 🔐 Security & Privacy Summary

### Data We Collect
- GitHub user ID (for authentication)
- Email address (optional, from GitHub)
- License/subscription status
- User preferences and settings

### Data We Store Locally (Device Only)
- Deribit API keys (encrypted with AES-256)
- Trading strategy configurations
- User interface preferences
- Error logs (opt-in via telemetry)

### Data We Never Collect
- Private keys or seed phrases
- Passwords
- Order details (prices, amounts)
- Account balances
- Personal financial information

### Third-Party Services
1. **GitHub**: Authentication and user profile
2. **Deribit**: Trading API (your credentials, direct connection)
3. **Apple**: In-app purchase verification (when applicable)

## 📝 Review Notes

### App Category
**Finance** - Cryptocurrency Trading Tools

### Age Rating
**17+** - Frequent/Intense Simulated Gambling (due to trading nature)

### Content Warnings
- Involves real money trading
- High risk of financial loss
- Requires understanding of derivatives trading
- Not suitable for inexperienced traders

### Special Considerations
- This is a professional trading tool, not a game or social app
- Requires users to have existing Deribit exchange account
- Requires understanding of cryptocurrency derivatives
- All trades execute on external exchange (Deribit)
- App is a client/interface, not a broker or exchange

## 🎯 Compliance Summary

| Requirement | Status | Location |
|-------------|--------|----------|
| Restore Purchases | ✅ | License Dialog → Products |
| Risk Disclaimer | ✅ | First run + Live mode switch |
| Privacy Policy | ✅ | Footer + Settings + License Dialog |
| Telemetry Off | ✅ | Default false, Settings → Privacy |
| Offline Mode | ✅ | Graceful backend fallback |
| Testnet Access | ✅ | Settings → Connection |
| Clear Pricing | ✅ | License Dialog → Products |
| No Hidden Fees | ✅ | All costs shown upfront |
| Data Encryption | ✅ | API keys encrypted locally |
| GDPR Compliance | ✅ | Privacy Policy covers all requirements |

---

**Last Updated**: December 2024  
**Version**: 1.0  
**Contact**: privacy@tradebaas.app
