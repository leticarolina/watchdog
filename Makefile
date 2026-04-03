CONTRACT_ID=CDVNQCBS26ATIJ7FBQZTPV4UDFLCM2TKZ4E77ONRXU4SN2BCNQRSRESC

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