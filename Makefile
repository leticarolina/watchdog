CONTRACT_ID=CDK4XFYOHDCJTRXNM4I56ZYUEVLQIRLRLOT7R6XRRYSGPBTGXXSB7DVH

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
		--amount $(AMOUNT)

initialize:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- initialize \
		--owner $$(stellar keys address mykeystellar) \
		--max-single-payment 200000000 \
		--daily-budget 400000000

get-limits:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source-account mykeystellar \
		--network testnet \
		-- get_limits

set-limits:
	stellar contract invoke \
		--id $(CONTRACT_ID) \
		--source mykeystellar \
		--network testnet \
		-- set_limits \
		--caller $$(stellar keys address mykeystellar) \
		--max-single-payment 60000000 \
		--daily-budget 100000000
	