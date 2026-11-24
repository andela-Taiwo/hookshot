.PHONY: help setup fmt lint typecheck test check

help: ## list targets
	@grep -E '^[a-z-]+:.*## ' Makefile | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## install locked dependencies
	npm ci

fmt: ## format the code
	npm run --silent format

lint: ## check formatting
	npm run --silent format:check

typecheck: ## strict type check
	npm run --silent typecheck

test: ## run the tests
	npm test --silent

check: lint typecheck test ## everything
