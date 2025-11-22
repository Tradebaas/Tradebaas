#!/bin/bash
# Sync .env.production to systemd backend .env and restart service
cp /root/Tradebaas-1/.env.production /opt/tradebaas/backend/.env
sudo systemctl restart tradebaas-backend
