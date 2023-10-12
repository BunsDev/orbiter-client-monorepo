# Makefile for managing Docker Compose deployment of Node.js project
.DEFAULT_GOAL:=help
COMPOSE_ALL_FILES := -f docker-compose.explore.yml
# Configuration variables
# DOCKER_COMPOSE_FILE ?= docker-compose.yml
NODE_CONTAINER_NAME ?= node-app
NODE_IMAGE_NAME ?= your-node-app-image
NODE_APP_PORT ?= 3000
REDIS_PASSWORD ?= $(shell openssl rand -hex 12)
SERVICE = explore
DOCKER_COMPOSE_COMMAND = docker-compose

create-network: 
	docker network create orbiter-network
build-docker-base:
	docker build -f ./Dockerfile . -t orbiter/clients:latest

build-docker-crawler:
	docker build -f apps/explore-DataCrawler/Dockerfile.clients . -t orbiter/explore-data-crawler:latest
build-docker-refinery:
	docker build -f apps/explore-DataRefinery/Dockerfile.clients . -t orbiter/explore-data-refinery:latest
build-docker-explore: build-docker-crawler build-docker-refinery
	# build success
build-docker-maker:
	docker build -f apps/maker-client/Dockerfile.clients . -t orbiter/maker-client:latest
explore:create-network # Target to start the Explore application
	${DOCKER_COMPOSE_COMMAND} $(COMPOSE_ALL_FILES) up -d
maker:create-network # Target to start the Explore application
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.maker.yml  up -d
# Target to stop the Node.js application
stop:
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml stop
ps:				## Show all running containers.
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml ps
down:			## Down Explore and all its extra components.
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml down
rm:				## Remove ELK and all its extra components containers.
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml rm
images:			## Show all Images of Explore and all its extra components.
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml images
push:
	docker push $(NODE_IMAGE_NAME)
clean: ## Clear all Images Container
	${DOCKER_COMPOSE_COMMAND} ${COMPOSE_ALL_FILES} down --rmi all
prune:			## Remove  Containers and Delete Volume Data
	@make stop && make rm
	@docker volume prune -f --filter label=com.docker.compose.project=orbiter-explore
logs: ## Show all Images logs
	${DOCKER_COMPOSE_COMMAND} -f docker-compose.$(SERVICE).yml logs -f --tail 500
init-explore:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env
	@echo "REDIS_PASSWORD=$(REDIS_PASSWORD)" >> .env
init-maker:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env
help:       	## Show this help.
	@echo "Make Application Docker Images and Containers using Docker-Compose files in 'docker' Dir."
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m (default: help)\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: install start stop build push clean logs generate-config build-all build-crawler build-refinery build-openapi
