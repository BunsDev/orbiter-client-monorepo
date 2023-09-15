# Stage 1: Build the Application
FROM docker.io/node:lts-alpine as builder

# Install build dependencies for node-gyp.
RUN apk add g++ make python3

# Set the working directory in the container.
WORKDIR /app

# Copy package.json and yarn.lock to the container.
COPY package.json yarn.lock ./

# Configure Yarn to use a Taobao registry for faster package downloads.
RUN yarn config set registry https://registry.npm.taobao.org
RUN yarn config set ignore-engines true

# Install application dependencies with Yarn, with an increased network timeout.
RUN yarn install --network-timeout 600000

# Copy the application code to the container.
COPY dist/apps/explore-server explore-server

# Stage 2: Run the Application
FROM docker.io/node:lts-alpine

# Set environment variables for the application.
ENV HOST=0.0.0.0
ENV PORT=3000

# Create a system user and group for the explore-server application.
RUN addgroup --system explore-server && \
    adduser --system -G explore-server explore-server

# Set the working directory in the container.
WORKDIR /app

# Copy the built application from the builder stage.
COPY --from=builder /app .

# Change ownership of the copied files to the explore-server user.
RUN chown -R explore-server:explore-server .

EXPOSE 3000
# Start the explore-server application.
CMD [ "node", "explore-server/main.js" ]
