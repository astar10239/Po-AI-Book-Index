#!/bin/bash
# ==============================================================================
# Celery Worker Startup Script for macOS (Apple Silicon compatible)
# auto-handles Ctrl+C graceful shutdowns and prevents SIGSEGV Python fork crashes
# ==============================================================================

OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES celery -A tasks.celery worker --loglevel=info
