# Wasche - WhatsApp MCP Server & Scheduler Sidecar
# Developer Makefile

.DEFAULT_GOAL := help
.PHONY: help install dev dev-backend dev-frontend build-ui build-dev build start check test lint format clean clean-data

# Auto-detect package manager (prefers pnpm, falls back to npm)
PKG_MGR := $(shell if command -v pnpm >/dev/null 2>&1; then echo pnpm; else echo npm; fi)
RUN := $(if $(filter pnpm,$(PKG_MGR)),pnpm,npm run)

# Default data directory in project root for local development
export WASCHE_DATA_DIR ?= ./data

# Colors for terminal output
CYAN  := \033[36m
GREEN := \033[32m
YELLOW:= \033[33m
RESET := \033[0m

help: ## Show this help message
	@printf "\n$(CYAN)Wasche Development Tasks:$(RESET)\n"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[32m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\nPackage manager in use: $(YELLOW)$(PKG_MGR)$(RESET)\n\n"

install: ## Install frontend dependencies
	@echo "==> Installing dashboard dependencies using $(PKG_MGR)..."
	@cd dashboard && $(PKG_MGR) install

dashboard/dist:
	@echo "==> Building dashboard SPA (required for embedded Rust assets)..."
	@cd dashboard && $(PKG_MGR) install && $(RUN) build

build-ui: ## Compile the frontend SPA to dashboard/dist
	@echo "==> Compiling dashboard SPA..."
	@cd dashboard && $(RUN) build

dev-backend: dashboard/dist ## Run Rust daemon & MCP server in dev mode (port 3030)
	@echo "==> Starting Wasche backend daemon..."
	RUST_LOG=info cargo run

dev-frontend: ## Run frontend Vite dev server with instant HMR (port 3000)
	@echo "==> Starting Vite dev server on http://localhost:3000..."
	@cd dashboard && $(RUN) dev

dev: dashboard/dist ## Run both backend daemon and frontend dev server concurrently
	@echo "==> Launching full-stack dev mode (Press Ctrl+C to stop both)..."
	@bash -c '\
		trap "echo \"\nShutting down dev servers...\"; kill \$$(jobs -p) 2>/dev/null || true" EXIT INT TERM; \
		(cd dashboard && $(RUN) dev) & \
		RUST_LOG=info cargo run & \
		wait'

build-dev: dashboard/dist ## Compile debug binary without running (target/debug/wasche)
	@echo "==> Compiling debug binary..."
	cargo build

build: dashboard/dist ## Build production release binary (target/release/wasche)
	@echo "==> Compiling dashboard SPA..."
	@cd dashboard && pnpm build
	@echo "==> Compiling production release binary..."
	cargo build --release

start: ## Run production release binary (target/release/wasche)
	@if [ ! -f ./target/release/wasche ]; then \
		printf "$(YELLOW)==> Error: Release binary not found at ./target/release/wasche$(RESET)\n"; \
		printf "$(YELLOW)==> Please run '$(GREEN)make build$(YELLOW)' first.$(RESET)\n"; \
		exit 1; \
	fi
	@echo "==> Starting Wasche production binary..."
	./target/release/wasche

check: dashboard/dist ## Run cargo check and frontend linter
	@echo "==> Checking Rust code..."
	cargo check
	@echo "==> Checking dashboard code..."
	@cd dashboard && $(RUN) lint && $(RUN) format:check

test: dashboard/dist ## Run all unit and integration tests
	@echo "==> Running tests..."
	cargo test

lint: ## Run cargo clippy and frontend oxlint
	@echo "==> Linting Rust..."
	cargo clippy --all-targets -- -D warnings
	@echo "==> Linting frontend..."
	@cd dashboard && $(RUN) lint

format: ## Auto-format Rust (cargo fmt) and frontend (oxfmt)
	@echo "==> Formatting Rust..."
	cargo fmt
	@echo "==> Formatting frontend..."
	@cd dashboard && $(RUN) format

clean: ## Clean build artifacts (target/ and dashboard/dist/)
	@echo "==> Cleaning Rust target..."
	cargo clean
	@echo "==> Cleaning dashboard dist..."
	rm -rf dashboard/dist

clean-data: ## Wipe local development databases and sessions (./data/)
	@echo "==> Cleaning local session data..."
	rm -rf $(WASCHE_DATA_DIR) qr.html
