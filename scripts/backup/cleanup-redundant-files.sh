#!/bin/bash

# Script om overbodige bestanden uit het project te verwijderen
# Gemaakt op: $(date)

echo "🧹 Opruimen van overbodige bestanden..."

# Array van te verwijderen bestanden
FILES_TO_REMOVE=(
  "src/lib/strategies/thirdIterationStrategy.ts"
  "src/lib/strategies/thirdIterationStrategy.removed.md"
  ".removed-use-runner-orchestrator"
  "src/hooks/use-runner-orchestrator.removed.md"
)

# Tel verwijderde bestanden
REMOVED_COUNT=0

# Loop door alle bestanden
for file in "${FILES_TO_REMOVE[@]}"; do
  if [ -f "$file" ]; then
    echo "  ❌ Verwijderen: $file"
    rm "$file"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
  else
    echo "  ⚠️  Niet gevonden (al verwijderd?): $file"
  fi
done

echo ""
echo "✅ Klaar! $REMOVED_COUNT bestand(en) verwijderd."
echo ""
echo "Samenvatting van verwijderde bestanden:"
echo "  • thirdIterationStrategy.ts en .removed.md (duplicaten van vortexStrategy.ts)"
echo "  • .removed-use-runner-orchestrator (verouderde documentatie)"
echo "  • use-runner-orchestrator.removed.md (verouderde documentatie)"
echo ""
echo "💡 De volgende bestanden blijven behouden:"
echo "  ✓ src/lib/strategies/vortexStrategy.ts (huidige versie)"
echo "  ✓ src/lib/strategies/scalpingStrategy.ts"
echo "  ✓ src/lib/strategies/fastTestStrategy.ts"
