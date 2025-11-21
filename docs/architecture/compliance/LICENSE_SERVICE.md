# License & Entitlement Service

A client-side licensing and entitlement management system for Tradebaas, simulating a microservice architecture using Spark KV storage.

## Architecture

The license service is implemented as a client-side service layer that provides the same API surface as a traditional backend microservice, but operates entirely in the browser using Spark's persistent key-value storage.

### Components

- **LicenseService** (`src/lib/license-service.ts`) - Core service handling all license logic
- **LicenseAPI** (`src/lib/license-api.ts`) - API layer exposing REST-like endpoints
- **useLicense Hook** (`src/hooks/use-license.ts`) - React hook for consuming license state
- **LicenseDialog** (`src/components/LicenseDialog.tsx`) - UI for managing licenses

## API Endpoints (Simulated)

### POST /auth/signin-apple

Exchange Apple token for user account.

```typescript
const result = await licenseAPI.signInWithApple(appleToken);
// Returns: { success: boolean, userId: string, error?: string }
```

### POST /iap/verify-receipt

Verify Apple IAP receipt server-side and store entitlement.

```typescript
const result = await licenseAPI.verifyReceipt({
  receipt: "receipt_...",
  productId: "basic_monthly"
});
// Returns: { valid: boolean, entitlement?: Entitlement, error?: string }
```

### GET /me/entitlement

Get current user's entitlement status.

```typescript
const status = await licenseAPI.getEntitlement();
// Returns: { tier: Tier, expiry: string | null, isActive: boolean, daysRemaining: number | null }
```

### POST /webhooks/appstore

Handle App Store Server Notifications V2.

```typescript
const result = await licenseAPI.handleWebhook(notification);
// Returns: { success: boolean, error?: string }
```

Supported notification types:
- `INITIAL_BUY` - New subscription
- `DID_RENEW` - Subscription renewed
- `DID_FAIL_TO_RENEW` - Renewal failed
- `CANCEL` - Subscription cancelled

## Data Models

### Tiers

```typescript
type Tier = 'free' | 'basic' | 'premium' | 'enterprise';
```

### Entitlement

```typescript
interface Entitlement {
  userId: string;
  tier: Tier;
  expiry: string | null; // ISO 8601 date or null for lifetime
  createdAt: string;
  updatedAt: string;
}
```

### User

```typescript
interface User {
  id: string;
  email: string;
  appleId?: string;
  createdAt: string;
}
```

### Product

```typescript
interface Product {
  id: string;
  name: string;
  tier: Tier;
  price: number;
  duration: number; // days
}
```

## Storage Schema

All data is stored in Spark KV storage with the following keys:

- `user:{userId}` - User records
- `entitlement:{userId}` - User entitlements
- `entitlements:all` - Array of all user IDs with entitlements

## Products

| Product ID | Name | Tier | Price | Duration |
|------------|------|------|-------|----------|
| `basic_monthly` | Basic Monthly | basic | $9.99 | 30 days |
| `premium_monthly` | Premium Monthly | premium | $29.99 | 30 days |
| `enterprise_yearly` | Enterprise Yearly | enterprise | $299.99 | 365 days |

## Usage

### React Components

```typescript
import { useLicense } from '@/hooks/use-license';

function MyComponent() {
  const { entitlement, loading, error, refreshEntitlement } = useLicense();
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <p>Tier: {entitlement.tier}</p>
      <p>Active: {entitlement.isActive ? 'Yes' : 'No'}</p>
      {entitlement.daysRemaining && (
        <p>Days Remaining: {entitlement.daysRemaining}</p>
      )}
    </div>
  );
}
```

### Direct Service Access

```typescript
import { licenseService } from '@/lib/license-service';

// Initialize service
await licenseService.initialize();

// Get entitlement
const status = await licenseService.getEntitlement();

// Verify receipt
const result = await licenseService.verifyReceipt({
  receipt: "receipt_abc123",
  productId: "premium_monthly"
});

// Generate JWT
const jwt = await licenseService.generateJWT(status);
```

### Admin Functions

Only available to app owner (checked via `spark.user().isOwner`):

```typescript
// Grant entitlement manually
await licenseService.grantEntitlement(
  userId: "user123",
  tier: "premium",
  durationDays: 30
);

// Grant lifetime access
await licenseService.grantEntitlement(
  userId: "user123",
  tier: "enterprise",
  durationDays: null // null = lifetime
);
```

## JWT Format

Generated JWTs follow standard format with simulated signature:

```
{header}.{payload}.simulated-signature
```

Payload contains:
```json
{
  "tier": "premium",
  "expiry": "2024-12-31T23:59:59.999Z",
  "isActive": true,
  "iat": 1234567890,
  "exp": 1234567890
}
```

## UI Integration

The license badge appears in the app header showing the current tier:

```
[FREE] [BASIC] [PREMIUM] [ENTERPRISE]
```

Clicking the badge opens the License Dialog with three tabs:
1. **Status** - Current entitlement details
2. **Products** - Available subscription tiers
3. **Admin** - Management tools (owner only)

## Testing Receipt Verification

For testing, receipts must follow the format:
```
receipt_{anything}
```

Example: `receipt_test_basic_20240101`

The service validates format but does not communicate with Apple servers.

## Limitations

This is a **client-side simulation** of a licensing microservice:

- ❌ No real Apple IAP validation (requires server-side API)
- ❌ No cryptographic JWT signatures (uses simulated signature)
- ❌ No Postgres database (uses Spark KV storage)
- ❌ No protection against client-side tampering
- ✅ Provides correct API structure for future backend migration
- ✅ Full CRUD operations on entitlements
- ✅ Persistent storage across sessions
- ✅ Owner-based access control
- ✅ Webhook notification handling pattern

## Future Migration to Real Backend

To migrate to a real backend microservice:

1. Deploy the service to a Node.js/Express server
2. Connect to Postgres database using provided schema
3. Add Apple IAP validation using `node-apple-receipt-verify`
4. Implement proper JWT signing with secret key
5. Add rate limiting and request validation
6. Set up webhook endpoint with Apple
7. Update frontend API calls to hit backend endpoints

The API surface is designed to remain unchanged during migration.

## Security Considerations

**Current (Client-Side):**
- Entitlements stored in Spark KV (user-scoped)
- Owner check via `spark.user().isOwner`
- No sensitive data transmission
- Simulated JWT for development

**Production (Server-Side Required):**
- Server-side receipt validation with Apple
- Cryptographic JWT signing
- Database access control
- Webhook signature verification
- Rate limiting and DDoS protection
- API authentication tokens

## Acceptance Criteria

✅ Verified receipts → entitlement granted
✅ Entitlement stored persistently in KV
✅ JWT generated with tier and expiry
✅ `/me/entitlement` (getEntitlement) reports correct status
✅ UI remains unchanged (except license badge in header)
✅ Admin can manage entitlements
✅ Webhook handler processes renewals and cancellations
✅ Tiers: free, basic, premium, enterprise
✅ Expiry dates calculated from product duration
✅ Days remaining computed accurately
✅ Owner-only admin access enforced
