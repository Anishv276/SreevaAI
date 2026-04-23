FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for Postgres, FFmpeg (for audio processing), and building plugins
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download AI model files for plugins (ai-coustics, turn-detector, etc.)
RUN python agent.py download-files

# Start the agent in production mode
CMD ["python", "agent.py", "start"]
