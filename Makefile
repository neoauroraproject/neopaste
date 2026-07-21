APP_NAME := neopaste
MODULE := github.com/neoauroraproject/neopaste
DIST := dist/neopaste
VERSION ?= 1.2.0

.PHONY: all web deps build build-linux build-linux-arm64 package clean run

all: package

web/node_modules:
	cd web && npm install

web: web/node_modules
	cd web && npm run build

deps:
	go mod tidy

build: web deps
	go build -ldflags="-s -w" -o bin/$(APP_NAME) ./cmd/neopaste

build-linux: web deps
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/$(APP_NAME)-linux-amd64 ./cmd/neopaste

build-linux-arm64: web deps
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/$(APP_NAME)-linux-arm64 ./cmd/neopaste

package: build-linux
	rm -rf $(DIST)
	mkdir -p $(DIST)
	cp bin/$(APP_NAME)-linux-amd64 $(DIST)/neopaste
	cp scripts/install.sh scripts/uninstall.sh $(DIST)/
	cp README.md $(DIST)/README.txt
	chmod +x $(DIST)/neopaste $(DIST)/install.sh $(DIST)/uninstall.sh
	@echo ""
	@echo "Offline package ready: $(DIST)/"
	@echo "Copy that folder to the server and run: sudo bash install.sh"

run: web deps
	go run ./cmd/neopaste -listen :8080 -data ./data

clean:
	rm -rf bin dist web/dist web/node_modules data
