# Makefile for managing Docker Compose deployment of Node.js project
.DEFAULT_GOAL:=help
COMPOSE_ALL_FILES := -f docker-compose.yml
# Configuration variables
# DOCKER_COMPOSE_FILE ?= docker-compose.yml
NODE_CONTAINER_NAME ?= node-app
NODE_IMAGE_NAME ?= your-node-app-image
NODE_APP_PORT ?= 3000
REDIS_PASSWORD ?= $(shell openssl rand -hex 12)

DOCKER_COMPOSE_COMMAND = docker-compose




install: 
	@echo "Installing Node.js and npm and NX..."
	@sudo yum install -y nodejs npm
	@npm install --global nx@latest

start: # Target to start the Node.js application
	${DOCKER_COMPOSE_COMMAND} $(COMPOSE_ALL_FILES) up -d

# Target to stop the Node.js application
stop:
	${DOCKER_COMPOSE_COMMAND} $(COMPOSE_ALL_FILES) down

# Target to build the Docker image for Node.js application
build-all: build-crawler build-refinery build-openapi

build-crawler: 	## Build explore-DataCrawler Images
	# docker build -t $(NODE_IMAGE_NAME) .
	nx run explore-DataCrawler:docker-build
build-refinery: ## Build explore-DataRefinery Images
	nx run explore-DataRefinery:docker-build
build-openapi: ## Build OpenApi Images
	nx run explore-open-api:docker-build

ps:				## Show all running containers.
	$(DOCKER_COMPOSE_COMMAND) ${COMPOSE_ALL_FILES} ps

down:			## Down Explore and all its extra components.
	$(DOCKER_COMPOSE_COMMAND) ${COMPOSE_ALL_FILES} down

images:			## Show all Images of Explore and all its extra components.
	$(DOCKER_COMPOSE_COMMAND) ${COMPOSE_ALL_FILES} images

push:
	docker push $(NODE_IMAGE_NAME)

clean: ## Clear all Images Container
	${DOCKER_COMPOSE_COMMAND} ${COMPOSE_ALL_FILES} down --rmi all

logs: ## Show all Images logs
	${DOCKER_COMPOSE_COMMAND} ${COMPOSE_ALL_FILES} logs -f --tail 500

generate-config:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env
	@echo "REDIS_PASSWORD=$(REDIS_PASSWORD)" >> .env

help:       	## Show this help.
	@echo "Make Application Docker Images and Containers using Docker-Compose files in 'docker' Dir."
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m (default: help)\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: install start stop build push clean logs generate-config build-all build-crawler build-refinery build-openapi
