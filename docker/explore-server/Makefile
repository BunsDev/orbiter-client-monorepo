# Makefile for managing Docker Compose deployment of Node.js project

# Configuration variables
DOCKER_COMPOSE_FILE ?= docker-compose.yml
NODE_CONTAINER_NAME ?= node-app
NODE_IMAGE_NAME ?= your-node-app-image
NODE_APP_PORT ?= 3000
REDIS_PASSWORD ?= $(shell openssl rand -hex 12)

# Default target
all: 
	@echo "Installing Node.js and npm and NX..."
	@sudo yum install -y nodejs npm
	@npm install --global nx@latest
# Target to start the Node.js application
start:
	docker-compose -f $(DOCKER_COMPOSE_FILE) up -d

# Target to stop the Node.js application
stop:
	docker-compose -f $(DOCKER_COMPOSE_FILE) down

# Target to build the Docker image for Node.js application
build-all: build-crawler build-refinery build-openapi

build-crawler:
	# docker build -t $(NODE_IMAGE_NAME) .
	nx run explore-DataCrawler:docker-build
build-refinery:
	nx run explore-DataRefinery:docker-build
build-openapi:
	nx run explore-open-api:docker-build


# Target to push the Docker image to a registry (optional)
push:
	docker push $(NODE_IMAGE_NAME)

# Target to clean up Docker resources (containers and images)
clean:
	docker-compose -f $(DOCKER_COMPOSE_FILE) down --rmi all

# Target to view logs from the Node.js application
logs:
	docker-compose -f $(DOCKER_COMPOSE_FILE) logs -f $(NODE_CONTAINER_NAME)

# Target to generate the configuration file with a random Redis password
generate-config:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env
	@echo "REDIS_PASSWORD=$(REDIS_PASSWORD)" >> .env



.PHONY: all start stop build push clean logs generate-config
