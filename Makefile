CONTRACT_ID=CBJUMLEZ3BQKQFGNEQLF2WDH6ORTHA2ATFEWTRVNZZYYGWFVBY5DKU6U

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