import os
import asyncio
import aiohttp
from dotenv import load_dotenv

load_dotenv(override=True)

async def test_sarvam():
    api_key = os.getenv("SARVAM_API_KEY")
    print(f"Testing with API Key: {api_key[:10]}...{api_key[-4:]}")
    
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "API-Subscription-Key": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "inputs": ["Hello world"],
        "target_language_code": "hi-IN",
        "speaker": "meera",
        "pitch": 0,
        "pace": 1.0,
        "loudness": 1.5,
        "speech_sample_rate": 8000,
        "enable_preprocessing": True,
        "model": "bulbul:v3"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as resp:
            print(f"Response Status: {resp.status}")
            if resp.status != 200:
                print(f"Error Body: {await resp.text()}")
            else:
                print("Success! The REST API works.")

if __name__ == "__main__":
    asyncio.run(test_sarvam())
