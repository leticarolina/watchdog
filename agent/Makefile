# ─────────────────────────────────────────────
# Watchdog Agent Test Commands
# ─────────────────────────────────────────────

BASE_URL=http://localhost:3000

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

config:
	curl $(BASE_URL)/config

# ─────────────────────────────────────────────
# DEEP TEST (should block immediately)
# ─────────────────────────────────────────────

deep:
	curl -i $(BASE_URL)/analysis/deep

# ─────────────────────────────────────────────
# BASIC PAYMENT TEST
# (runs pay-test script)
# ─────────────────────────────────────────────

basic:
	node --loader ts-node/esm scripts/pay-test.ts

# ─────────────────────────────────────────────
# MULTIPLE BASIC CALLS
# Useful to hit DailyBudgetExceeded
# ─────────────────────────────────────────────

basic-loop:
	for i in {1..6}; do \
		echo "\n--- BASIC CALL $$i ---"; \
		node --loader ts-node/esm scripts/pay-test.ts; \
		sleep 5; \
	done

# ─────────────────────────────────────────────
# FULL FLOW TEST
# Runs config → deep → basics
# ─────────────────────────────────────────────

full-test:
	make config
	echo "\n--- DEEP TEST ---"
	make deep
	echo "\n--- BASIC LOOP ---"
	make basic-loop