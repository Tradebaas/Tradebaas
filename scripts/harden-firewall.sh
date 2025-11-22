#!/bin/bash
# Harden firewall to match MASTER.md guidance
# - Allow loopback and established connections
# - Allow SSH (22), HTTP (80), HTTPS (443) from anywhere
# - Allow WebSocket (3001) from anywhere
# - Allow backend API (3000), Postgres (5432), Redis (6379) ONLY from localhost
# - Drop all other incoming connections

set -euo pipefail

echo "Applying hardened firewall rules..."

# Flush existing rules
sudo iptables -F
sudo iptables -X

# Allow loopback and established/related
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH, HTTP, HTTPS from anywhere
sudo iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -m conntrack --ctstate NEW -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -m conntrack --ctstate NEW -j ACCEPT

# Allow WebSocket port (frontend clients connect here via Nginx or directly if configured)
sudo iptables -A INPUT -p tcp --dport 3001 -m conntrack --ctstate NEW -j ACCEPT

# Allow backend API only from localhost (127.0.0.1)
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 3000 -j ACCEPT

# Allow Postgres only from localhost
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 5432 -j ACCEPT

# Allow Redis only from localhost
sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 6379 -j ACCEPT

# Optional: allow any other required localhost-only services (e.g., dev ports)
# sudo iptables -A INPUT -p tcp -s 127.0.0.1 --dport 5000 -j ACCEPT

# Drop all other incoming
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT

echo "Saving iptables rules..."
if command -v netfilter-persistent >/dev/null 2>&1; then
	sudo netfilter-persistent save
elif command -v iptables-save >/dev/null 2>&1; then
	sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
fi

echo "Firewall rules applied."
