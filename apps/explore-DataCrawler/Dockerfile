# Stage 1: Build the Application
FROM docker.io/node:lts-alpine as builder

# Install build dependencies for node-gyp.
RUN apk add g++ make python3
# Set the working directory in the container.
WORKDIR /app

# Copy package.json and yarn.lock to the container.
COPY package.json ./
# COPY package.json yarn.lock ./

# Configure Yarn to use a Taobao registry for faster package downloads.
# RUN yarn config set registry https://registry.npm.taobao.org
RUN npm install -g node-gyp

# Install application dependencies with Yarn, with an increased network timeout.
RUN yarn config set ignore-engines true
RUN yarn install --network-timeout 600000

# Copy the application code to the container.
COPY dist/apps/explore-DataCrawler explore-DataCrawler

# Stage 2: Run the Application
FROM docker.io/node:lts-alpine

# Set environment variables for the application.
ENV HOST=0.0.0.0
ENV PORT=3000

# Create a system user and group for the explore-DataCrawler application.
RUN addgroup --system explore-DataCrawler && \
    adduser --system -G explore-DataCrawler explore-DataCrawler

# Set the working directory in the container.
WORKDIR /app

# Copy the built application from the builder stage.
COPY --from=builder /app .

# Change ownership of the copied files to the explore-DataCrawler user.
RUN chown -R explore-DataCrawler:explore-DataCrawler .

EXPOSE 3000
# Start the explore-DataCrawler application.
CMD [ "node", "explore-DataCrawler/main.js" ]
