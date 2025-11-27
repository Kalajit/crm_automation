# FROM node:18-alpine

# # Set working directory
# WORKDIR /app

# # Copy package files
# COPY package*.json ./

# # Install dependencies
# # RUN npm install --only=production
# RUN npm install 


# # Install PhonePe SDK inside docker
# # RUN npm install https://phonepe.mycloudrepo.io/public/repositories/phonepe-pg-sdk-node/releases/v2/phonepe-pg-sdk-node.tgz --verbose



# # Install dependencies
# # Clean install to ensure PhonePe SDK is downloaded fresh
# RUN npm cache clean --force && \
#     npm install --production && \
#     npm install https://phonepe.mycloudrepo.io/public/repositories/phonepe-pg-sdk-node/releases/v2/phonepe-pg-sdk-node.tgz







# # Copy application files
# # COPY server.js .
# # COPY invoicePayment.js .
# # COPY .env .
# COPY . .

# # Expose port
# EXPOSE 3000

# # Health check
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#   CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# # Start application
# CMD ["node", "server.js"]








FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm cache clean --force && \
    npm install --production && \
    npm install https://phonepe.mycloudrepo.io/public/repositories/phonepe-pg-sdk-node/releases/v2/phonepe-pg-sdk-node.tgz

# Copy application files
COPY . .

# Create recordings directory
RUN mkdir -p /app/recordings

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "src/server.js"]