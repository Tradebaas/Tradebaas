#!/bin/bash

# Stop Development Servers
echo "🛑 Stopping all development servers..."

# Stop Next.js processes
pkill -f "next dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

# Kill processes on development ports
for port in 3000 8000 3001 6006; do
    pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "🛑 Stopping process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null || true
    fi
done

echo "✅ All development servers stopped"
echo "🚀 Run './dev-server.sh' or 'npm run dev:clean' to restart"