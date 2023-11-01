# Decentralized Cross-Chain Bridge

<img src="logo.png" alt="Image" width="400" >

> A decentralized cross-chain bridge for transferring assets and data between different blockchain networks.

## Overview

This project aims to provide a decentralized solution for making interoperability between different blockchain networks easy. Through this cross-chain bridge, users can transfer digital assets, tokens, or data across various blockchain protocols and networks, enabling a more interconnected blockchain ecosystem.

## Key Features

- **Multi-Blockchain Support**: Integrates with multiple blockchain protocols and networks, including but not limited to Ethereum, Binance Smart Chain, Polygon, and more.
- **Decentralized Operation**: The cross-chain bridge operates on a decentralized network, ensuring security and reliability.
- **User-Friendly**: A user-friendly interface and documentation to facilitate user-friendly cross-chain interactions.
- **Smart Contract Integration**: Smart contracts automate cross-chain transactions and asset locking/unlocking.
- **Open Source**: The project is fully open source, and contributions from developers and the community are welcome.

## Getting Started

To start using this cross-chain bridge, follow these steps:

1. **Install Dependencies**: Ensure you have installed the project's required dependencies.

   ```shell
   npm install
   ```
   // Some
   ```shell
   yarn install
   ```

2. **Environment Variables**: Create a .env environment variable file, refer to .env.example
   ```
    CONSUL_HOST="127.0.0.1"
    CONSUL_PORT=15008
    CONSUL_TOKEN="xxxx"
   ```
3. **Run Project**: Create a .env environment variable file, refer to .env.example

    - Explore Server
    ```
        npm run dev:explore-DataCrawler
    ```
    - Maker Client
    ```
        npm run dev:maker-client
    ```

## Build Docker
  - Explore Server
    ```
        npm run build-docker:explore-DataCrawler
    ```
  - Maker Client
    ```
        npm run build-docker:maker-client
    ```