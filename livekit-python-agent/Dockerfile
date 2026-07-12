FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run as a non-root user -- code execution inside the container should not
# equal root on the container. Created before COPY so --chown= sets ownership
# inline instead of a separate `chown -R` pass over the whole tree afterward.
RUN groupadd --system --gid 1001 agent \
    && useradd --system --uid 1001 --gid agent agent

COPY --chown=agent:agent . .

USER agent

# Pre-download LiveKit models
RUN python -m livekit.agents download-files

CMD ["python", "agent.py", "start"]