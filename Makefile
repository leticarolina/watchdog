CONTRACT_ID=CDXL6SOYHR4WXSAFHGCX2XD4WDW253PZLZO4X5IYYXYQH4BWJABZXDRK

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