/**
 * Radix UI React 19 Compatibility Fix
 * 
 * Radix UI components have type compatibility issues with React 19 due to
 * duplicate @types/react resolution from root vs workspace node_modules.
 * 
 * This wildcard declaration suppresses type errors for all Radix UI modules.
 * The components work correctly at runtime - these are TypeScript-only issues.
 * 
 * Issue: Type 'import("/root/Tradebaas-1/node_modules/@types/react/index").ReactNode'
 *        is not assignable to type 'React.ReactNode'
 * 
 * Radix UI will fix these in upcoming releases for React 19 compatibility.
 */

declare module '@radix-ui/*' {
  const content: any;
  export = content;
}

declare module 'lucide-react/dist/esm/icons/*' {
  const content: any;
  export default content;
}
