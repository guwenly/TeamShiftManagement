# Use Python as the base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies for Node.js and Python
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js installation
RUN node --version && npm --version

# Copy dependency files
COPY pyproject.toml poetry.lock package.json package-lock.json ./

# Install Poetry and Python dependencies
RUN pip install poetry && poetry config virtualenvs.create false && poetry install --only main --no-root

# Install Node.js dependencies
RUN npm install

# Copy all application files
COPY . .

# Expose the application port
EXPOSE 5000

# Run the application
CMD ["flask", "--app", "main", "run", "--host=0.0.0.0", "--port=5000"]
