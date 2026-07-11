# The Beginner's Guide to LiveKit AI Deployment

Welcome to the team! This guide explains how our **Python AI Interviewer** works and how to manage it.

> **TL;DR:** We host our Next.js website on AWS, but we host our Python AI Agent on **LiveKit Cloud**. We do this because generating AI voices and recording video requires massive server power, and LiveKit handles all that heavy lifting for us automatically.

All code for the AI agent lives exclusively in the `livekit-python-agent/` folder.

---

## Scenario A: Day-to-Day Updates (Already Deployed)
If the project is already set up and you just want to edit the Python code (like changing the LLM prompt or tweaking the interview logic), this is all you need to do:

### Step 1: Write your code
Make your changes inside the `livekit-python-agent/interview/` folder.

### Step 2: Push to GitHub (Automated Magic)
We have a GitHub Action set up (`.github/workflows/deploy-agent.yml`). 
Simply run:
```bash
git add .
git commit -m "Updated the AI prompt"
git push
```
**What happens?** GitHub automatically detects you changed the Python code, connects to LiveKit Cloud, and deploys your new agent. You are done!

### Optional Step: Deploy Manually
If you don't want to wait for GitHub Actions, you can deploy it yourself from your terminal:
```bash
cd livekit-python-agent
lk agent deploy
```

---

## Scenario B: Adding New API Keys
The Python agent needs API keys (OpenAI, Cartesia, etc.) to function. Because it lives in the cloud, you cannot just use a local `.env` file. You must securely upload your keys to LiveKit.

### Step 1: Update your local file
Open the `.envprod` file in the root of the project and paste your new API key.

### Step 2: Push the keys to the cloud
Run this command to send those keys to LiveKit securely:
```bash
lk agent update-secrets --secrets-file .envprod
```
*Note: This command instantly restarts the live Python agent so it can start using the new keys.*

---

## Scenario C: Troubleshooting & Logs
If the AI is acting weird or failing to join a call, you need to look at its brain.

### Step 1: Watch the Live Logs
Run this command from anywhere in your terminal:
```bash
lk agent logs
```
This streams the live output from the cloud. If the agent crashes (e.g., "Missing OpenAI Key"), you will see a big red error here. If it says `registered worker`, it is healthy and waiting for a call.

---

## Scenario D: Complete Setup From Scratch
If we ever delete our LiveKit project and need to build a brand new one from scratch, follow these steps:

### Step 1: Generate a new Agent config
```bash
cd livekit-python-agent
lk agent create
```
Choose "Python" when it asks. This will generate a `livekit.toml` file linking your code to the new project.

### Step 2: Upload Secrets
```bash
cd ..
lk agent update-secrets --secrets-file .envprod
```

### Step 3: Deploy the code
```bash
cd livekit-python-agent
lk agent deploy
```
