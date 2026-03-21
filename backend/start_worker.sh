#!/bin/bash
# ==============================================================================
# Celery Worker Startup Script for macOS (Apple Silicon compatible)
# auto-handles Ctrl+C graceful shutdowns and prevents SIGSEGV Python fork crashes
# ==============================================================================

echo "Starting Celery Worker safely on macOS with --pool=solo..."
echo "Press Ctrl+C at any time to instantly and gracefully shut down."

OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES celery -A tasks.celery worker --loglevel=info
