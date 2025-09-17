#!/bin/bash

# Development Server Manager
# Stops all existing servers and starts fresh on consistent ports

echo "🔄 Development Server Manager"
echo "================================"

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        echo "🛑 Stopping process on port $port (PID: $pid)"
        kill -9 $pid 2>/dev/null
        sleep 1
    else
        echo "✅ Port $port is already free"
    fi
}

# Function to kill Next.js dev processes by name
kill_next_processes() {
    echo "🛑 Stopping all Next.js development processes..."
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "node.*next" 2>/dev/null || true
    sleep 2
}

# Stop existing servers
echo "🧹 Cleaning up existing processes..."
kill_next_processes
kill_port 3000
kill_port 8000
kill_port 3001  # In case something is running on 3001

echo ""
echo "🚀 Starting development servers..."

# Start Next.js on port 3000
echo "📦 Starting Next.js on http://localhost:3000"
export PORT=3000
nohup npm run dev > /tmp/next-dev.log 2>&1 &
NEXT_PID=$!

# Wait a moment for server to start
sleep 3

# Check if Next.js started successfully
if ps -p $NEXT_PID > /dev/null; then
    echo "✅ Next.js started successfully (PID: $NEXT_PID)"
    echo "🌐 Frontend: http://localhost:3000"
else
    echo "❌ Failed to start Next.js"
    echo "📝 Check logs: tail -f /tmp/next-dev.log"
    exit 1
fi

# Optional: Start additional services on port 8000
# Uncomment and modify as needed for your backend/API server
# echo "📦 Starting API server on http://localhost:8000"
# nohup your-api-command > /tmp/api-dev.log 2>&1 &
# API_PID=$!
# echo "✅ API server started (PID: $API_PID)"

echo ""
echo "🎉 Development environment ready!"
echo "================================"
echo "Frontend: http://localhost:3000"
echo "Port 8000: Available for API/Backend"
echo ""
echo "📝 Logs:"
echo "  Next.js: tail -f /tmp/next-dev.log"
echo ""
echo "🛑 To stop all servers: pkill -f 'next dev' && kill $(lsof -t -i:3000,8000 2>/dev/null)"