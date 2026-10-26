# Shortcuts for the commands worth remembering. Everything here is a thin
# wrapper over an npm script, so there is never a second source of truth.

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev build test coverage verify seed reset docker-build docker-up docker-down stats clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies and create .env if missing
	npm ci
	@test -f .env || { \
		cp .env.example .env; \
		secret=$$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"); \
		node -e "const fs=require('fs');fs.writeFileSync('.env',fs.readFileSync('.env','utf8').replace(/^JWT_SECRET=.*$$/m,'JWT_SECRET=$$secret'))"; \
		echo "created .env with a generated JWT_SECRET"; \
	}

dev: ## Run the API and dashboard together
	npm run dev

build: ## Build every package
	npm run build

test: ## Run the test suite
	npm test

coverage: ## Run the suite with a coverage report
	npm run coverage

verify: ## Everything CI runs: format, lint, typecheck, test
	npm run verify

seed: ## Generate 60 days of demo traffic
	npm run seed

reset: ## Delete the local database and reseed
	rm -rf data
	npm run seed

docker-build: ## Build the production image
	docker build -t devpulse:local .

docker-up: ## Start the compose stack
	docker compose up -d --build

docker-down: ## Stop the compose stack
	docker compose down

stats: ## Report what is in the local database
	node scripts/db-stats.mjs

clean: ## Remove build output and coverage
	rm -rf packages/*/dist coverage
	find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete
