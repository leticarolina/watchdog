# CONTRACT_ID=CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH
CONTRACT_ID=CBA2LXX3FZ5TN5HHVGSJ47AUF3ZCLS6NG6AKE2ZZEHC5LEJQLJU6RBT2
XLM_SAC_TESTNET=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC

build:
	stellar contract build

test:
	cargo test --manifest-path contracts/watchdog-contract/Cargo.toml

deploy:
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/watchdog_contract.wasm \
		--source mykeystellar \
		--network testnet

invoke:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- request-payment \
		--agent $$(stellar keys address mykeystellar) \
		--recipient $(RECIPIENT) \
		--amount $(AMOUNT)

deposit:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- deposit \
		--from $$(stellar keys address mykeystellar) \
		--amount $(AMOUNT)

get-balance:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- get_balance

initialize:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- initialize \
		--owner $$(stellar keys address mykeystellar) \
		--max-single-payment 200000000 \
		--budget-cap 600000000 \
		--token $(XLM_SAC_TESTNET) \
		--window-seconds 86400

get-limits:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- get_limits

get-config:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- get_config

set-limits:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- set_limits \
		--caller $$(stellar keys address mykeystellar) \
		--max-single-payment 60000000 \
		--budget-cap 100000000

set-window:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- set_window \
		--caller $$(stellar keys address mykeystellar) \
		--window-seconds $(WINDOW_SECONDS)

set-allowlist:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- set_allowlist \
		--caller $$(stellar keys address mykeystellar) \
		--recipient GBCP3AAFAMUN5OCNGM3AIASNQSLFU7DTFI2LBEKIICFHJLZY2GYTCM6U \
		--allowed $(ALLOWED)

is-allowed:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- is_allowed \
		--recipient GC2L7472GR5WYXGSNILF5ME4VS6KA2LMWQMU6PIFKEWTPWQZTBKL5L2G

set-paused:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- set_paused \
		--caller $$(stellar keys address mykeystellar) \
		--paused $(PAUSED)

is-paused:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- is_paused