// LEGACY: verplaatst vanuit src/lib/strategies/thirdIterationStrategy.ts
// Zie CLEANUP_PLAN.md voor context. Niet meer gebruiken in productiecode.
// Dit bestand was alleen een alias/re-export van vortexStrategy.ts
// Gebruik direct vortexStrategy.ts in plaats hiervan.

export * from './vortexStrategy';
export { VortexStrategy as ThirdIterationStrategy } from './vortexStrategy';
export { DEFAULT_VORTEX_CONFIG as DEFAULT_THIRD_ITERATION_CONFIG } from './vortexStrategy';
export { createVortexStrategy as createThirdIterationStrategy } from './vortexStrategy';
