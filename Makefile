# Makefile for managing Docker Compose deployment of a Node.js project

# Default target
.DEFAULT_GOAL := help

# Docker Compose configuration
COMPOSE_FILE := docker-compose.explore.yml
DOCKER_COMPOSE := docker-compose
NETWORK_NAME := orbiter-network

# Docker build configuration
BASE_IMAGE := orbiter/clients:latest
CRAWLER_IMAGE := orbiter/explore-data-crawler:latest
REFINERY_IMAGE := orbiter/explore-data-refinery:latest
MAKER_IMAGE := orbiter/maker-client:latest

# Configuration variables
NODE_CONTAINER_NAME := node-app
NODE_IMAGE_NAME := your-node-app-image
NODE_APP_PORT := 3000
REDIS_PASSWORD := $(shell openssl rand -hex 12)

# Create Docker network
create-network: ## Create a Docker network if it doesn't exist
	@if ! docker network inspect $(NETWORK_NAME) > /dev/null 2>&1; then \
		echo "Creating Docker network: $(NETWORK_NAME)"; \
		docker network create $(NETWORK_NAME); \
	else \
		echo "Docker network $(NETWORK_NAME) already exists"; \
	fi

# Build Docker images
build-docker-base: ## Build the Docker base image
	docker build -f ./Dockerfile . -t $(BASE_IMAGE)

build-docker-crawler: ## Build the Explore Data Crawler Docker image
	docker build -f apps/explore-DataCrawler/Dockerfile.clients . -t $(CRAWLER_IMAGE)

build-docker-refinery: ## Build the Explore Data Refinery Docker image
	docker build -f apps/explore-DataRefinery/Dockerfile.clients . -t $(REFINERY_IMAGE)

build-docker-explore: build-docker-crawler build-docker-refinery ## Build Explore Docker images
	# Build success

build-docker-maker: ## Build the Maker Client Docker image
	docker build -f apps/maker-client/Dockerfile.clients . -t $(MAKER_IMAGE)

build-docker-openapi: ## Build the Open Api Docker image
	docker build -f apps/explore-open-api/Dockerfile.clients . -t $(MAKER_IMAGE)

# Start Explore application
explore: create-network ## Start the Explore application
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) up -d

# Start Maker application
maker: create-network ## Start the Maker application
	$(DOCKER_COMPOSE) -f docker-compose.maker.yml up -d
# Start OpenApi application
openapi: create-network ## Start the OpenApi application
	$(DOCKER_COMPOSE) -f docker-compose.openapi.yml up -d

# Stop the Node.js application
stop: ## Stop the Node.js application
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml stop

# Show all running containers
ps: ## Show all running containers
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml ps

# Stop and remove Explore and its extra components containers
down: ## Stop Explore and all its extra components
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml down

# Remove Explore and its extra components containers
rm: ## Remove Explore and all its extra components containers
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml rm

# Show images of Explore and its extra components
images: ## Show images of Explore and all its extra components
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml images

# Push Docker image to Docker registry
push: ## Push Docker image to the registry
	docker push $(NODE_IMAGE_NAME)

# Clean all Docker containers and images
clean: ## Clear all Images Container
	$(DOCKER_COMPOSE) -f $(COMPOSE_FILE) down --rmi all

# Prune Docker containers and volumes
prune: ## Remove Containers and Delete Volume Data
	@make stop && make rm
	@docker volume prune -f --filter label=com.docker.compose.project=orbiter-explore

# Show logs of Explore and its extra components
logs: ## Show all Images logs
	$(DOCKER_COMPOSE) -f docker-compose.$(SERVICE).yml logs -f --tail 500

docker-makefile:
	curl -o Makefile.docker -L https://raw.githubusercontent.com/kakui-lau/Makefile/main/makefile.docker
# Initialize Explore application configuration
init-explore:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env
	@echo "REDIS_PASSWORD=$(REDIS_PASSWORD)" >> .env

# Initialize Maker application configuration
init-maker:
	@echo "Generating configuration with user input..."
	@read -p "Enter Consul URL: " CONSUL_URL; \
		echo "CONSUL_URL=$$CONSUL_URL" > .env

# Help target to display available targets
help: ## Show this help.
	@echo "Make Application Docker Images and Containers using Docker-Compose files in 'docker' Dir."
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m (default: help)\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
