# Stage 1: Build the Application
FROM docker.io/node:lts-alpine as builder

# Install build dependencies for node-gyp.
RUN apk add g++ make python3

# Set the working directory in the container.
WORKDIR /app

# Copy package.json and yarn.lock to the container.
COPY package.json yarn.lock ./

# Configure Yarn to use a Taobao registry for faster package downloads.
RUN yarn config set ignore-engines true

# Install application dependencies with Yarn, with an increased network timeout.
RUN yarn install --network-timeout 600000

# Copy the application code to the container.
COPY dist/apps/maker-client maker-client

# Stage 2: Run the Application
FROM docker.io/node:lts-alpine

# Set environment variables for the application.
ENV HOST=0.0.0.0
ENV PORT=3000

# Create a system user and group for the maker-client application.
RUN addgroup --system maker-client && \
    adduser --system -G maker-client maker-client

# Set the working directory in the container.
WORKDIR /app

# Copy the built application from the builder stage.
COPY --from=builder /app .

# Change ownership of the copied files to the maker-client user.
RUN chown -R maker-client:maker-client .

EXPOSE 3000
# Start the maker-client application.
CMD [ "node", "maker-client/main.js" ]
