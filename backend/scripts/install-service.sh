#!/bin/bash
# TradeBaas Backend - systemd Service Installation Script
# 
# This script installs and configures the TradeBaas backend as a systemd service
# for 24/7 operation with automatic restart on failure.
#
# Usage:
#   sudo ./install-service.sh [install|uninstall|status]

set -e

SERVICE_NAME="tradebaas-backend"
SERVICE_FILE="tradebaas-backend.service"
SYSTEMD_DIR="/etc/systemd/system"
INSTALL_DIR="/opt/tradebaas"
USER="tradebaas"
GROUP="tradebaas"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

create_user() {
    if id "$USER" &>/dev/null; then
        log_info "User $USER already exists"
    else
        log_info "Creating user $USER..."
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER"
    fi
}

create_directories() {
    log_info "Creating directories..."
    
    mkdir -p "$INSTALL_DIR/backend/data/backups"
    mkdir -p "$INSTALL_DIR/backend/logs"
    
    # Set ownership
    chown -R "$USER:$GROUP" "$INSTALL_DIR"
    
    # Set permissions
    chmod 755 "$INSTALL_DIR/backend"
    chmod 700 "$INSTALL_DIR/backend/data"
    chmod 755 "$INSTALL_DIR/backend/logs"
    
    log_info "✅ Directories created"
}

install_service() {
    log_info "Installing systemd service..."
    
    # Check if service file exists
    if [ ! -f "config/$SERVICE_FILE" ]; then
        log_error "Service file config/$SERVICE_FILE not found"
        exit 1
    fi
    
    # Copy service file
    cp "config/$SERVICE_FILE" "$SYSTEMD_DIR/$SERVICE_FILE"
    
    # Reload systemd
    systemctl daemon-reload
    
    log_info "✅ Service installed"
}

enable_service() {
    log_info "Enabling service to start on boot..."
    systemctl enable "$SERVICE_NAME"
    log_info "✅ Service enabled"
}

start_service() {
    log_info "Starting service..."
    systemctl start "$SERVICE_NAME"
    
    # Wait a bit for startup
    sleep 3
    
    # Check status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "✅ Service started successfully"
        systemctl status "$SERVICE_NAME" --no-pager
    else
        log_error "Service failed to start"
        journalctl -u "$SERVICE_NAME" -n 50 --no-pager
        exit 1
    fi
}

uninstall_service() {
    log_warn "Uninstalling service..."
    
    # Stop service
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "Stopping service..."
        systemctl stop "$SERVICE_NAME"
    fi
    
    # Disable service
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        log_info "Disabling service..."
        systemctl disable "$SERVICE_NAME"
    fi
    
    # Remove service file
    if [ -f "$SYSTEMD_DIR/$SERVICE_FILE" ]; then
        log_info "Removing service file..."
        rm "$SYSTEMD_DIR/$SERVICE_FILE"
    fi
    
    # Reload systemd
    systemctl daemon-reload
    
    log_info "✅ Service uninstalled"
    log_warn "Note: User $USER and directories in $INSTALL_DIR were NOT removed"
}

show_status() {
    log_info "Service status:"
    systemctl status "$SERVICE_NAME" --no-pager || true
    
    echo ""
    log_info "Recent logs:"
    journalctl -u "$SERVICE_NAME" -n 20 --no-pager || true
}

# Main execution
case "${1:-install}" in
    install)
        check_root
        log_info "Installing TradeBaas backend service..."
        create_user
        create_directories
        install_service
        enable_service
        
        log_info ""
        log_info "✅ Installation complete!"
        log_info ""
        log_info "Next steps:"
        log_info "1. Build the backend: cd backend && npm run build"
        log_info "2. Copy built files to $INSTALL_DIR/backend"
        log_info "3. Create .env file in $INSTALL_DIR/backend with required variables"
        log_info "4. Start the service: sudo systemctl start $SERVICE_NAME"
        log_info ""
        log_info "Useful commands:"
        log_info "  sudo systemctl status $SERVICE_NAME"
        log_info "  sudo journalctl -u $SERVICE_NAME -f"
        log_info "  sudo systemctl restart $SERVICE_NAME"
        ;;
    
    uninstall)
        check_root
        uninstall_service
        ;;
    
    status)
        show_status
        ;;
    
    *)
        echo "Usage: $0 [install|uninstall|status]"
        exit 1
        ;;
esac
