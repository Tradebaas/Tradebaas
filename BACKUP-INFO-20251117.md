# 💾 Tradebaas Backup Log

## Backup Details

**Datum:** 17 november 2025, 14:20:03  
**Bestand:** `Tradebaas-backup-20251117-142003.tar.gz`  
**Locatie:** `/root/`  
**Grootte:** 270 MB  
**Bestanden:** 559 items  

---

## Wat zit erin?

### **Inclusief:**
✅ Complete source code (frontend + backend)
✅ Configuration files (.env, ecosystem.config.cjs)
✅ Documentation (DOCS/, *.md files)
✅ Database (state/trades.db)
✅ Strategy backups (backend/data/backups/)
✅ Deployment scripts (deploy-backend.sh, update-frontend-env.sh)
✅ Package files (package.json, package-lock.json)

### **Exclusief:**
❌ node_modules (te groot, reinstall met npm install)
❌ .git directory (version control history)
❌ dist folders (rebuild met npm run build)
❌ Log files (*.log)
❌ .next / .cache (build artifacts)

---

## Restore Instructies

### **Complete Restore:**

```bash
# Extract backup
cd /root
tar -xzf Tradebaas-backup-20251117-142003.tar.gz

# Reinstall dependencies
cd Tradebaas
npm install

cd backend
npm install

# Rebuild
cd /root/Tradebaas/backend
npm run build

# Restart services
pm2 restart tradebaas-backend
```

### **Selective Restore (specifieke files):**

```bash
# Lijst bekijken
tar -tzf Tradebaas-backup-20251117-142003.tar.gz | grep "bestandsnaam"

# Enkel bestand extracten
tar -xzf Tradebaas-backup-20251117-142003.tar.gz "Tradebaas/backend/.env"

# Hele directory extracten
tar -xzf Tradebaas-backup-20251117-142003.tar.gz "Tradebaas/state/"
```

---

## Quick Reference

```bash
# Create backup
tar -czf backup.tar.gz --exclude='node_modules' --exclude='.git' Tradebaas/

# List contents
tar -tzf backup.tar.gz

# Extract all
tar -xzf backup.tar.gz

# Extract specific file
tar -xzf backup.tar.gz "path/to/file"

# Test integrity
tar -tzf backup.tar.gz > /dev/null && echo "OK"
```

---

**Status:** ✅ Valid & Complete - Ready for deployment!
