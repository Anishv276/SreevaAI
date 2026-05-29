agent:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python agent.py dev
    22:35:51.435 DEBUG    asyncio            Using proactor: IocpProactor
    22:35:51.446 DEV      livekit.agents     Watching C:\Users\vamsi\OneDrive\Desktop\HR-updates
    22:35:56.063 DEBUG    asyncio            Using proactor: IocpProactor
    22:35:56.078 INFO     livekit.agents     starting worker {"version": "1.5.10", "rtc-version": "1.1.8"}
    22:35:56.080 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.cartesia", "version": "1.5.10"}
    22:35:56.082 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.deepgram", "version": "1.5.10"}
    22:35:56.084 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.openai", "version": "1.5.10"}
    22:35:56.086 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.sarvam", "version": "1.5.10"}
    22:35:56.089 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.silero", "version": "1.5.10"}
    22:35:56.091 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.elevenlabs", "version": "1.5.10"}
    22:35:56.098 INFO     livekit.agents     HTTP server listening on :54111
    22:35:56.101 INFO     livekit.agents     initializing job runner {"tid": 21600}
{"timestamp": "2026-05-29 22:35:56,103", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 379, "taskName": null}
{"timestamp": "2026-05-29 22:35:56,309", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 382, "taskName": null}
{"timestamp": "2026-05-29 22:35:56,310", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 732, "taskName": null}
{"timestamp": "2026-05-29 22:35:56,310", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 390, "taskName": null}
{"timestamp": "2026-05-29 22:35:56,310", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 395, "taskName": null}
{"timestamp": "2026-05-29 22:35:56,311", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 410, "taskName": null}
    22:35:56.311 DEBUG    asyncio            Using proactor: IocpProactor
    22:35:56.313 INFO     livekit.agents     job runner initialized {"tid": 21600, "elapsed_time": 0.21}
    22:35:56.642 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id": "AW_6hZ7J5jw6g7n", "url":
"wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India South", "protocol": 17}
    22:36:16.481 INFO     livekit.agents     received job request
                                         {"job_id": "AJ_nH6iMfbWC6wG", "dispatch_id": "AD_pEjeFEZaWb7e", "room":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "room_id": "RM_8wKrirHE8YC2", "agent_name": "ai_interviewer", "resuming":
false, "enable_recording": false}
    22:36:16.525 DEBUG    livekit.agents     received assignment
                                         {"agent_name": "ai_interviewer", "room_id": "RM_8wKrirHE8YC2", "room":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "job_id": "AJ_nH6iMfbWC6wG", "dispatch_id": "AD_pEjeFEZaWb7e",
"enable_recording": false}
{"timestamp": "2026-05-29 22:36:16,535", "level": "INFO", "message": "Connecting to room interview_app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_runtime", "line": 491, "taskName": "job_user_entrypoint"}
{"timestamp": "2026-05-29 22:36:16,535", "level": "INFO", "message": "[SESSION] interview context loaded", "logger": "interview-agent", "module": "agent_runtime", "line": 546, "taskName": "job_user_entrypoint", "event": "session_start", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:16.585 INFO     livekit.agents     initializing job runner {"tid": 27884}
{"timestamp": "2026-05-29 22:36:16,587", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 379, "taskName": null}
{"timestamp": "2026-05-29 22:36:16,762", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 382, "taskName": null}
{"timestamp": "2026-05-29 22:36:16,762", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 732, "taskName": null}
{"timestamp": "2026-05-29 22:36:16,763", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 390, "taskName": null}
{"timestamp": "2026-05-29 22:36:16,763", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 395, "taskName": null}
{"timestamp": "2026-05-29 22:36:16,764", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 410, "taskName": null}
    22:36:16.764 DEBUG    asyncio            Using proactor: IocpProactor
    22:36:16.767 INFO     livekit.agents     job runner initialized {"tid": 27884, "elapsed_time": 0.18}
{"timestamp": "2026-05-29 22:36:17,389", "level": "INFO", "message": "[STARTUP] Fetched  resume=YES jd=YES custom_q=0 | candidate=Vadla Vamsi Krishna | role=GTM Engineer (Fresher)", "logger": "interview-agent", "module": "agent_runtime", "line": 621, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,390", "level": "INFO", "message": "[STARTUP] JD keys  must_have=['build and manage outreach systems (LinkedIn, Email, WhatsApp)', 'set up and optimize lead generation workflows', 'n8n', 'Zapier', 'analyze campaign performance and improve conversions', 'support in building AI-driven sales and marketing systems'] nice_to_have=[]", "logger": "interview-agent", "module": "agent_runtime", "line": 629, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,390", "level": "INFO", "message": "[STARTUP] Custom questions: NONE configured", "logger": "interview-agent", "module": "agent_runtime", "line": 636, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,390", "level": "INFO", "message": "[FLOW] Custom questions  none configured", "logger": "interview-agent", "module": "agent_runtime", "line": 644, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,391", "level": "INFO", "message": "[FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM Engineer (Fresher)", "logger": "interview-agent", "module": "agent_runtime", "line": 702, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,393", "level": "INFO", "message": "[INTERVIEW_CONTEXT]\nCANDIDATE: Vadla Vamsi Krishna | ROLE: GTM Engineer (Fresher) | BAND: fresher | TIME: 20m\n\nFETCH SUMMARY:\n  Resume: fetched | JD: fetched | Custom Q: 0\n  JD Must-Have Skills: build and manage outreach systems (LinkedIn, Email, WhatsApp), set up and optimize lead generation workflows, n8n, Zapier, analyze campaign performance and improve conversions, support in building AI-driven sales and marketing systems\n  JD Nice-To-Have: none\n  Coverage Targets: python, datascience, powerbi, ai, n8n, Apollo, Multi Channel Lead Qualification System, Sensex Analysis Project\n\nRESUME BRIEF:\n  Anchor: Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website] (type: project)\n  Skills: python, datascience, powerbi, ai, n8n\n  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System\n  Work History: Personal Brand & Marketing Automation Strategist | Python Developer\n  Internships: none\n  Education: B.Tech | MPC\n\nINTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. Open with: 'Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website]'. Band=fresher: probe HOW they think  real decisions, specifics, learning signals. Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural.", "logger": "interview-agent", "module": "agent_runtime", "line": 782, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,398", "level": "INFO", "message": "[FLOW] System prompt ready  greeting  warmup  interview", "logger": "interview-agent", "module": "agent_runtime", "line": 808, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,399", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3-general language=en-US diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 732, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,399", "level": "INFO", "message": "[TTS] Using SARVAM  voice=priya model=bulbul:v3", "logger": "interview-agent", "module": "agent_runtime", "line": 818, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:17,399", "level": "INFO", "message": "[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en voice=priya api_key_len=36", "logger": "interview-agent", "module": "agent_providers", "line": 611, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,369", "level": "INFO", "message": "[FLOW] Greeting precomputed during launching phase", "logger": "interview-agent", "module": "agent_runtime", "line": 846, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:18.374 DEBUG    livekit.agents     input stream attached
                                         {"participant": null, "source": "SOURCE_UNKNOWN", "accepted_sources":
["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:18.383 INFO     livekit.agents     adaptive interruption detector initialized
                                         {"base_url": "https://agent-gateway.livekit.cloud/v1", "detection_interval":
0.1, "audio_prefix_duration": 1.0, "max_audio_duration": 3, "min_frames": 2, "threshold": 0.5, "inference_timeout": 0.7,
"use_proxy": true, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:18.392 DEBUG    livekit.agents     http_session(): creating a new httpclient ctx
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:18.400 DEBUG    livekit.agents     using audio io: `RoomIO` -> `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:18.403 DEBUG    livekit.agents     using transcript io: `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:18.413 DEBUG    livekit.agents     start reading stream
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmpr67k-9159", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:36:18,416", "level": "INFO", "message": "[FLOW] launch_prereqs_ready signal sent to frontend", "logger": "interview-agent", "module": "agent_runtime", "line": 1017, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,417", "level": "INFO", "message": "[FLOW] Session started  candidate=Vadla Vamsi Krishna role=GTM Engineer (Fresher) band=fresher tts=SARVAM llm=gpt-4.1-mini boot=1881ms", "logger": "interview-agent", "module": "agent_runtime", "line": 2502, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,417", "level": "INFO", "message": "[FLOW] Greeting started  20-min interview timer begins NOW", "logger": "interview-agent", "module": "agent_runtime", "line": 2517, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,428", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=02ad44f8d995 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,431", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the G T M Engineer (Fresher) role. How are you doing? Hope the day's been good to you.\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,431", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,625", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmpr67k-9159 marked as IN_PROGRESS.", "logger": "interview-agent", "module": "agent_persistence", "line": 921, "taskName": "Task-62", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,705", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=02ad44f8d995 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:18,803", "level": "INFO", "message": "[REDIS_EVAL] Redis eval client connected and ping OK  redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768", "logger": "interview-agent", "module": "agent_runtime", "line": 966, "taskName": "Task-35", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:19.087 DEBUG    livekit.agents     aec warmup active, disabling interruptions for 0.50s
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:36:19,091", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:19.324 DEBUG    livekit.….deepgram Established new Deepgram STT WebSocket connection:
                                           {"headers": {"dg-project-id": "9ac4806b-a6d5-44a5-bf62-c3c6bbfc33e1",
"dg-request-id": "019e74b3-8b87-76c3-9e57-b462b4dd3007", "Date": "Fri, 29 May 2026 17:06:24 GMT"}, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:19.597 DEBUG    livekit.agents     aec warmup expired, re-enabling interruptions
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:36:24,328", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=02ad44f8d995 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:24,329", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=02ad44f8d995 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:24,389", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=02ad44f8d995 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,793", "level": "DEBUG", "message": "Transcript: Interviewer[12]: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM Engineer (Fresher) role. How are you doing? Hope the day's been good to you.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 189, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,794", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=0 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 2222, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,794", "level": "INFO", "message": "✅ TURN 1 | warmup=False", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,795", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,795", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,796", "level": "INFO", "message": "[TRANSCRIPT] Greeting appended to transcript (session.say bypass)", "logger": "interview-agent", "module": "agent_runtime", "line": 2539, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,797", "level": "INFO", "message": "[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)", "logger": "interview-agent", "module": "agent_runtime", "line": 2540, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,797", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:30,798", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started after greeting delivery", "logger": "interview-agent", "module": "agent_runtime", "line": 2585, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:32,458", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:35.111 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. It's good. How about you?", "language": "en-US",
"transcript_delay": 1.5520164966583252, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:36:35,160", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 2284, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,160", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 fragment #1: 'Yeah. It's good. How about you?...' (consolidated: 'Yeah. It's good. How about you?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,161", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 - debounce 0.30s (is_complete=True, words=6)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,166", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=d4bd99212e2a model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,401", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=d4bd99212e2a payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,462", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=1 - 1 fragments  complete utterance (sentence_complete): 'Yeah. It's good. How about you?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-213", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,463", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing greeting replay (turn already processed): 'Yeah. It's good. How about you?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1234, "taskName": "Task-213", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,559", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,560", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:35,560", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:38,218", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Good to hear! I'm doing well too, thanks for asking. Ready to jump in?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-207", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:38,219", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-207", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:38,617", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:40,051", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=d4bd99212e2a model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:40,051", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=d4bd99212e2a model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:40,100", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=d4bd99212e2a close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:42,198", "level": "DEBUG", "message": "Transcript: Interviewer[23]: Good to hear! I'm doing well too, thanks for asking. Ready to jump in?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:42,199", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=1 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 2222, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:42,199", "level": "INFO", "message": "✅ TURN 2 | warmup=False", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:42,201", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:42,201", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:44,065", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:36:44.910 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.084232330322266, "max_delay": 2.0,
"min_delay": 0.5, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:36:44.997 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. Yeah.", "language": "en-US", "transcript_delay":
0.5868077278137207, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:36:45,004", "level": "INFO", "message": "[WARMUP]  WARMUP COMPLETE at turn=2  INTERVIEW PHASE ACTIVE", "logger": "interview-agent", "module": "agent_runtime", "line": 2270, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,006", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 2284, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,006", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 fragment #1: 'Yeah. Yeah....' (consolidated: 'Yeah. Yeah....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,006", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 - debounce 0.30s (is_complete=True, words=2)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,012", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=fcda0d862000 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,228", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=fcda0d862000 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,309", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=2 - 1 fragments  complete utterance (sentence_complete): 'Yeah. Yeah....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-306", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,309", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing early greeting echo fragment: 'Yeah.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1240, "taskName": "Task-306", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,404", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-289", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,404", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-289", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:45,406", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-289", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:47,629", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Great, let's get into it! About the Multi Channel Lead Qualification System you built, what was the hardest part of bringing all those different inbound sources like Instagram, Facebook, website, and email into one unified workflow?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-300", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:47,630", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-300", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:48,017", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:54,749", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=fcda0d862000 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:54,751", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=fcda0d862000 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:36:54,806", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=fcda0d862000 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,805", "level": "DEBUG", "message": "Transcript: Interviewer[44]: Great, let's get into it! About the Multi Channel Lead Qualification System you built—what was the hardest part of bringing all those different inbound sources like Instagram, Facebook, website, and email into one unified workflow?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,805", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=2 last_q='About the Multi Channel Lead Qualification System you built—'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,806", "level": "INFO", "message": "[PHASE_STATUS] Opening question sealed: 'About the Multi Channel Lead Qualification System you built—what was the hardest'", "logger": "interview-agent", "module": "agent_runtime", "line": 2211, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,806", "level": "INFO", "message": "[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)", "logger": "interview-agent", "module": "agent_runtime", "line": 2220, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,806", "level": "INFO", "message": "✅ TURN 3 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,806", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:02,806", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:04,809", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:07.385 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So, actually, there is a lot of", "language": "en-US",
"transcript_delay": 0.010327339172363281, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:12.217 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "we can do there, but, like, connecting all the APIs
together,", "language": "en-US", "transcript_delay": 0.006498813629150391, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:16.169 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "let's take an example, Meta API Meta API, Gmail API.",
"language": "en-US", "transcript_delay": 0.011106252670288086, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:17.810 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 3.6831021308898926, "max_delay": 2.0,
"min_delay": 0.5, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:17,818", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 fragment #1: 'So, actually, there is a lot of we can do there, b...' (consolidated: 'So, actually, there is a lot of we can do there, but, like, ...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:17,820", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 - debounce 0.30s (is_complete=True, words=28)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:17,823", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=c075e851007b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,054", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=c075e851007b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,122", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=3 - 1 fragments  complete utterance (sentence_complete): 'So, actually, there is a lot of we can do there, but, like, connecting all the A...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,122", "level": "DEBUG", "message": "Transcript: Candidate[59]: So, actually, there is a lot of we can do there, but, like, connecting all the APIs together, let's take an example, Meta API Meta API, Gmail API.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,123", "level": "INFO", "message": "[EVAL_GATE] turn=3 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,124", "level": "INFO", "message": "[SYNC_GATE] turn=3 | first eval turn — no prior result to fetch, skipping pubsub", "logger": "interview-agent", "module": "agent_runtime", "line": 1972, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,124", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=3 to eval_worker | answer='So, actually, there is a lot of we can do there, but, like, ' | question=\"Hi Vamsi, really glad we could connect today. I'm Ishitha, a\" | active_topic=None | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,213", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,218", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,219", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,219", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:18,228", "level": "INFO", "message": "[TRANSCRIPT] Partial save 4 lines, 59s duration, 1 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-482", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:18.274 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "You have to connect multiple APIs. So there might be",
"language": "en-US", "transcript_delay": 0.01429891586303711, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:18,399", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=3 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:19.609 DEBUG    livekit.agents     min endpointing delay updated: 0.5 -> 0.5414640426635742
                                         {"reason": "pause between utterances", "pause": 0.9146404266357422,
"max_delay": 2.0, "min_delay": 0.5414640426635742, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:19,619", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, connecting multiple A P I s can definitely be tricky. What specific challenges did you face working with the Meta and Gmail A P I s, and how did you handle them?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-477", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,619", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-477", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,622", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=c075e851007b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,623", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=c075e851007b close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,625", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,625", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,628", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 already processed — dropping late fragment 'You have to connect multiple APIs. So there might be'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,633", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=62168572ae04 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:19,857", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=62168572ae04 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:20,028", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-513", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:20,029", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-513", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:20,030", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-513", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:20.251 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "sort of", "language": "en-US", "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:22,433", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, working with multiple A P I s can definitely be tricky. Can you walk me through one specific challenge you faced with those A P I connections and how you handled it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-523", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:22,434", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-523", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:22,754", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:27,284", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=62168572ae04 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:27,287", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=62168572ae04 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:27,335", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=62168572ae04 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:31,577", "level": "INFO", "message": "[TIMER] remaining=1127s turn=3", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:33,001", "level": "DEBUG", "message": "Transcript: Interviewer[74]: Got it, working with multiple APIs can definitely be tricky. Can you walk me through one specific challenge you faced with those API connections and how you handled it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:33,002", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=3 last_q='Can you walk me through one specific challenge you faced wit'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:33,002", "level": "INFO", "message": "✅ TURN 4 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:33,003", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:33,007", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:34,810", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:37.969 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Usually, I faced a lot of", "language": "en-US",
"transcript_delay": 0.4108846187591553, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:38.109 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 3.71894907951355, "max_delay": 2.0,
"min_delay": 0.5414640426635742, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:38,116", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 fragment #1: 'sort of Usually, I faced a lot of...' (consolidated: 'sort of Usually, I faced a lot of...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,117", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,122", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=b00a84fe4aa9 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,258", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,334", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=b00a84fe4aa9 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,419", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=4 - 1 fragments  complete utterance (sentence_complete): 'sort of Usually, I faced a lot of...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,420", "level": "DEBUG", "message": "Transcript: Candidate[80]: sort of Usually, I faced a lot of", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,420", "level": "INFO", "message": "[EVAL_GATE] turn=4 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,420", "level": "INFO", "message": "[SYNC_GATE] turn=4 | subscribing for eval result of turn=3 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,501", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=4 | result already in Redis (pre-check 81ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,501", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=3 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,502", "level": "INFO", "message": "[MOVE_ON] ✅ topic change turn=3 | 'none' → 'Multi Channel Lead Qualification System' | covered=1 topics", "logger": "interview-agent", "module": "agent_runtime", "line": 1570, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,502", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=3 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 1.1/6.5 (17% done, 5.4 more needed) | follow_ups=1 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,502", "level": "INFO", "message": "[SCORES] turn=3 | clarity=4.0 depth=2.0 fluency=5.0 confidence=4.0 | overall=3.0 | integrity: 0→0 (Δ+0) | depth: 0→3 (Δ+3) | composite=1", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,503", "level": "INFO", "message": "[SIGNAL] example_given layer=behavioral_confidence confidence=0.80 trust_delta=+0.04 visible=True turn=3", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,505", "level": "INFO", "message": "[DECISION] turn=3 | action=PROBE | mode=evidence | next_goal='They claimed a skill or capability but gave zero real instan' | quality: clarity=4.0 depth=2.0 | overall=3.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,505", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=evidence | follow_ups=1 | goal=They claimed a skill or capability but gave zero real instan", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,505", "level": "INFO", "message": "[INJECT_FULL] turn=3 action=PROBE | old_directive_existed=False | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (EVIDENCE) | NEXT MOVE: They claimed a skill or capability but gave zero real instance of actually using it — get a specific moment. | STYLE: Move ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,506", "level": "INFO", "message": "[ROUTER] action=PROBE mode=evidence turn=3 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,506", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=3 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,506", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=4 to eval_worker | answer='sort of Usually, I faced a lot of' | question='Got it, working with multiple APIs can definitely be tricky.' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=1.1", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,517", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-651", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,518", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-651", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,519", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-651", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,525", "level": "INFO", "message": "[TRANSCRIPT] Partial save 6 lines, 80s duration, 2 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-669", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,799", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=4 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-668", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,839", "level": "INFO", "message": "[SCORE] Saved 1 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-670", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:38,884", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=3 (1 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-670", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:40,189", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Take your time, what kind of issues were you running into with the A P I connections?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-662", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:40,190", "level": "INFO", "message": "[TTS] Streamed 1 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-662", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:40,579", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:42,221", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=b00a84fe4aa9 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:42,221", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=b00a84fe4aa9 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:42.257 DEBUG    livekit.agents     max endpointing delay updated: 2.0 -> 2.0
                                         {"reason": "new turn (interruption)", "pause": 3.0449464321136475, "max_delay":
2.0, "min_delay": 0.5414640426635742, "between_utterance_delay": 0.6611638069152832, "between_turn_delay":
3.0449464321136475, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:42,275", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=b00a84fe4aa9 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:44,786", "level": "DEBUG", "message": "Transcript: Interviewer[86]: Take your time — what kind of issues were you running into with the API connections?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:44,786", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=4 last_q='Take your time — what kind of issues were you running into w'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:44,788", "level": "INFO", "message": "✅ TURN 5 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:44,789", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:44,790", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:45,758", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:50.632 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "yeah. Yeah. So, basically, what I was doing", "language":
"en-US", "transcript_delay": 0.0162198543548584, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:52.309 DEBUG    livekit.agents     min endpointing delay updated: 0.5414640426635742 -> 0.8885876703262328
                                         {"reason": "pause between utterances", "pause": 4.012700319290161, "max_delay":
2.0, "min_delay": 0.8885876703262328, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:52,458", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:53.977 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I was doing meta API errors. So there are a lot of",
"language": "en-US", "transcript_delay": 0.06435441970825195, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:57.323 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "errors in meta API. Like, we need to get a lot of things
like", "language": "en-US", "transcript_delay": 0.1655118465423584, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:37:59.160 DEBUG    livekit.agents     min endpointing delay updated: 0.8885876703262328 -> 0.8658612580299376
                                         {"reason": "pause between utterances", "pause": 0.6613235473632812,
"max_delay": 2.0, "min_delay": 0.8658612580299376, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:59,481", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 fragment #1: 'yeah. Yeah. So, basically, what I was doing I was ...' (consolidated: 'yeah. Yeah. So, basically, what I was doing I was doing meta...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,481", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 - debounce 0.30s (is_complete=True, words=34)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,483", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=6e60e5f2bd3b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,558", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,717", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=6e60e5f2bd3b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:37:59.781 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "we need to get some sort of", "language": "en-US",
"transcript_delay": 0.02086043357849121, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:37:59,785", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=5 - 1 fragments  complete utterance (sentence_complete): 'yeah. Yeah. So, basically, what I was doing I was doing meta API errors. So ther...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,785", "level": "DEBUG", "message": "Transcript: Candidate[101]: yeah. So, basically, what I was doing I was doing meta API errors. So there are a lot of errors in meta API. Like, we need to get a lot of things like", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,786", "level": "INFO", "message": "[EVAL_GATE] turn=5 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,786", "level": "INFO", "message": "[SYNC_GATE] turn=5 | subscribing for eval result of turn=4 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,885", "level": "INFO", "message": "[TRANSCRIPT] Partial save 8 lines, 101s duration, 3 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-805", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,901", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=5 | result already in Redis (pre-check 114ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,901", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=4 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,901", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=4 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 1.9/6.5 (29% done, 4.6 more needed) | follow_ups=2 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,901", "level": "INFO", "message": "[SCORES] turn=4 | clarity=2.0 depth=1.0 fluency=2.0 confidence=2.0 | overall=1.2 | integrity: 0→0 (Δ+0) | depth: 3→31 (Δ+28) | composite=12", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,902", "level": "INFO", "message": "[SIGNAL] example_evasion layer=behavioral_confidence confidence=0.78 trust_delta=-0.15 visible=False turn=4", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,902", "level": "INFO", "message": "[SIGNAL] latency_mismatch layer=behavioral_confidence confidence=0.77 trust_delta=-0.10 visible=False turn=4", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,902", "level": "INFO", "message": "[DECISION] turn=4 | action=PROBE | mode=process | next_goal='Understand HOW they actually built or did the work — get int' | quality: clarity=2.0 depth=1.0 | overall=1.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,902", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=process | follow_ups=2 | goal=Understand HOW they actually built or did the work — get int", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,903", "level": "INFO", "message": "[INJECT_FULL] turn=4 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (PROCESS) | NEXT MOVE: Understand HOW they actually built or did the work — get into the specifics of their process. | STYLE: They've claimed owner", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,903", "level": "INFO", "message": "[ROUTER] action=PROBE mode=process turn=4 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,903", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=4 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,903", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=5 to eval_worker | answer='yeah. So, basically, what I was doing I was doing meta API e' | question='Take your time — what kind of issues were you running into w' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=1.9", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,904", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-784", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,905", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-784", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:37:59,906", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-784", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:00,003", "level": "INFO", "message": "[SCORE] Saved 2 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-810", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:00,051", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=4 (2 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-810", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:00,202", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=5 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-804", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:00.911 DEBUG    livekit.agents     min endpointing delay updated: 0.8658612580299376 -> 0.8702260742664336
                                         {"reason": "pause between utterances", "pause": 0.9095094203948975,
"max_delay": 2.0, "min_delay": 0.8702260742664336, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:01,199", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I lost you a little, what does that look like in practice when you say “a lot of errors” with the Meta A P I?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-795", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,200", "level": "INFO", "message": "[TTS] Streamed 1 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-795", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:01.363 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "money, some sort of", "language": "en-US",
"transcript_delay": 0.9526748657226562, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:01,371", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=6e60e5f2bd3b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,380", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=6e60e5f2bd3b close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,390", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,392", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,400", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 already processed — dropping late fragment 'we need to get some sort of money, some sort of'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,406", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=77742ffb96da model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,638", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=77742ffb96da payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,797", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-839", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,798", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-839", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:01,799", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-839", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:02,910", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I lost you a little, when you say \"money,\" what does that look like in the context of the Meta A P I errors you were facing?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-851", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:02,910", "level": "INFO", "message": "[TTS] Streamed 1 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-851", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:03,247", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:07,448", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=77742ffb96da model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:07,452", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=77742ffb96da model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:07,521", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=77742ffb96da close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:12,885", "level": "DEBUG", "message": "Transcript: Interviewer[114]: I lost you a little—when you say \"money,\" what does that look like in the context of the Meta API errors you were facing?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:12,888", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=5 last_q='I lost you a little—when you say \"money,\" what does that loo'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:12,890", "level": "INFO", "message": "✅ TURN 6 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:12,892", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:12,893", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:15,867", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:16.675 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 2.9102113246917725, "max_delay": 2.0,
"min_delay": 0.8702260742664336, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:16,967", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:20.028 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Not money. I misspelled this word.", "language": "en-US",
"transcript_delay": 0.005411624908447266, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:38:22.267 DEBUG    livekit.agents     min endpointing delay updated: 0.8702260742664336 -> 0.8634549936723708
                                         {"reason": "pause between utterances", "pause": 0.8025152683258057,
"max_delay": 2.0, "min_delay": 0.8634549936723708, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:22,590", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 fragment #1: 'Not money. I misspelled this word....' (consolidated: 'Not money. I misspelled this word....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,591", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 - debounce 0.30s (is_complete=True, words=6)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,596", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=879e2eefef2b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,869", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=879e2eefef2b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,909", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=6 - 1 fragments  complete utterance (sentence_complete): 'Not money. I misspelled this word....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,910", "level": "DEBUG", "message": "Transcript: Candidate[124]: Not money. I misspelled this word.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,911", "level": "INFO", "message": "[EVAL_GATE] turn=6 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:22,911", "level": "INFO", "message": "[SYNC_GATE] turn=6 | subscribing for eval result of turn=5 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,002", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=6 | result already in Redis (pre-check 90ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,003", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=5 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,004", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=5 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 3.0/6.5 (46% done, 3.5 more needed) | follow_ups=3 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,005", "level": "INFO", "message": "[SCORES] turn=5 | clarity=3.0 depth=2.0 fluency=4.0 confidence=4.0 | overall=2.2 | integrity: 0→0 (Δ+0) | depth: 31→34 (Δ+3) | composite=14", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,005", "level": "INFO", "message": "[SIGNAL] example_given layer=behavioral_confidence confidence=0.80 trust_delta=+0.04 visible=True turn=5", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,006", "level": "INFO", "message": "[DECISION] turn=5 | action=PROBE | mode=evidence | next_goal='They claimed a skill or capability but gave zero real instan' | quality: clarity=3.0 depth=2.0 | overall=2.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,008", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=evidence | follow_ups=3 | goal=They claimed a skill or capability but gave zero real instan", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,010", "level": "INFO", "message": "[INJECT_FULL] turn=5 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (EVIDENCE) | NEXT MOVE: They claimed a skill or capability but gave zero real instance of actually using it — get a specific moment. | STYLE: Move ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,010", "level": "INFO", "message": "[ROUTER] action=PROBE mode=evidence turn=5 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,011", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=5 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,012", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=6 to eval_worker | answer='Not money. I misspelled this word.' | question='I lost you a little—when you say \"money,\" what does that loo' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=3.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,015", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-968", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,016", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-968", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,017", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-968", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,033", "level": "INFO", "message": "[TRANSCRIPT] Partial save 10 lines, 124s duration, 4 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-984", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,117", "level": "INFO", "message": "[SCORE] Saved 3 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-985", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,167", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=5 (3 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-985", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:23,300", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=6 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-983", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:23.332 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Meta API. We need a lot of approvals.", "language":
"en-US", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:23,535", "level": "INFO", "message": "[CHECKPOINT] Flushed 4 AI signal(s) to DB for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 899, "taskName": "Task-986", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,230", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'No worries, that happens! What word were you aiming for instead?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-979", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,231", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-979", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,234", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=879e2eefef2b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,237", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=879e2eefef2b close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,249", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,250", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,271", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 already processed — dropping late fragment 'Meta API. We need a lot of approvals.'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,284", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=d28330c9a937 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,532", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=d28330c9a937 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,663", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1018", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,668", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1018", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:24,670", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1018", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:25,992", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Ah, got it, approvals from Meta’s side for A P I access. That sounds like it could slow things down. How did you manage or work around those approval hurdles while building the system?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1028", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:25,993", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1028", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:26,327", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:31,120", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=d28330c9a937 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:31,137", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=d28330c9a937 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:31,197", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=d28330c9a937 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:31,663", "level": "INFO", "message": "[TIMER] remaining=1067s turn=6", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:37,004", "level": "DEBUG", "message": "Transcript: Interviewer[138]: Ah, got it — approvals from Meta’s side for API access. That sounds like it could slow things down. How did you manage or work around those approval hurdles while building the system?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:37,007", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=6 last_q='How did you manage or work around those approval hurdles whi'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:37,008", "level": "INFO", "message": "✅ TURN 7 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:37,012", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:37,013", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:42,179", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:43.525 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.634042978286743, "max_delay": 2.0,
"min_delay": 0.8634549936723708, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:43,878", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:44.297 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Mostly, I use it to", "language": "en-US",
"transcript_delay": 0.039073944091796875, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:38:48.720 DEBUG    livekit.agents     min endpointing delay updated: 0.8634549936723708 -> 0.8636366272931099
                                         {"reason": "pause between utterances", "pause": 0.8652713298797607,
"max_delay": 2.0, "min_delay": 0.8636366272931099, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:49,045", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 fragment #1: 'Mostly, I use it to...' (consolidated: 'Mostly, I use it to...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,047", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 - debounce 0.30s (is_complete=True, words=5)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,063", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=edd73cf620e7 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:38:49.154 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "recharge GBT and study there how to build, and then I use
it to build.", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:38:49,321", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=edd73cf620e7 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,354", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=7 - 1 fragments  complete utterance (sentence_complete): 'Mostly, I use it to...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,357", "level": "DEBUG", "message": "Transcript: Candidate[150]: Mostly, I use it to", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,359", "level": "INFO", "message": "[EVAL_GATE] turn=7 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,359", "level": "INFO", "message": "[SYNC_GATE] turn=7 | subscribing for eval result of turn=6 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,410", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=7 | result already in Redis (pre-check 51ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,412", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=6 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,414", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=6 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 3.8/6.5 (58% done, 2.7 more needed) | follow_ups=4 (opened_turn=0) | probe_rotation=1", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,416", "level": "INFO", "message": "[SCORES] turn=6 | clarity=3.0 depth=1.0 fluency=6.0 confidence=7.0 | overall=1.5 | integrity: 0→0 (Δ+0) | depth: 34→37 (Δ+3) | composite=15", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,418", "level": "INFO", "message": "[DECISION] turn=6 | action=PROBE | mode=verification | next_goal='The answer sounds rehearsed — probe real memory of the exact' | quality: clarity=3.0 depth=1.0 | overall=1.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,418", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=verification | follow_ups=4 | goal=The answer sounds rehearsed — probe real memory of the exact", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,419", "level": "INFO", "message": "[INJECT_FULL] turn=6 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (VERIFICATION) | NEXT MOVE: The answer sounds rehearsed — probe real memory of the exact moment, not the summary of it. | STYLE: Ask for something ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,419", "level": "INFO", "message": "[ROUTER] action=PROBE mode=verification turn=6 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,420", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=6 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,420", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=7 to eval_worker | answer='Mostly, I use it to' | question='Ah, got it — approvals from Meta’s side for API access. That' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=3.8", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,445", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1167", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,452", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1167", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,454", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1167", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,490", "level": "INFO", "message": "[TRANSCRIPT] Partial save 12 lines, 150s duration, 5 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-1190", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,538", "level": "INFO", "message": "[SCORE] Saved 4 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-1191", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,585", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=6 (4 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-1191", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:49,701", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=7 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-1189", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,049", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-1178", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,050", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1178", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,054", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=edd73cf620e7 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,056", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=edd73cf620e7 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,070", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,071", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,090", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 already processed — dropping late fragment 'recharge GBT and study there how to build, and then I use it'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,097", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=f91804a9abcc model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,324", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=f91804a9abcc payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,482", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1203", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,484", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1203", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:50,485", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1203", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:51,929", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, that makes sense, you learned by researching and experimenting before actually building. Can you give me a specific example of a time when you hit a roadblock during development and how you figured out a solution?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1213", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:51,929", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1213", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:52,288", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:58,544", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=f91804a9abcc model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:58,559", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=f91804a9abcc model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:38:58,643", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=f91804a9abcc close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:05,173", "level": "DEBUG", "message": "Transcript: Interviewer[166]: Okay, that makes sense — you learned by researching and experimenting before actually building. Can you give me a specific example of a time when you hit a roadblock during development and how you figured out a solution?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:05,175", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=7 last_q='Can you give me a specific example of a time when you hit a '", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:05,177", "level": "INFO", "message": "✅ TURN 8 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:05,179", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:05,180", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:08,467", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:11.620 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.14117431640625, "max_delay": 2.0,
"min_delay": 0.8636366272931099, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:39:12.089 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "To be honest, my main thing is to work", "language":
"en-US", "transcript_delay": 1.01884126663208, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:39:12,123", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 fragment #1: 'To be honest, my main thing is to work...' (consolidated: 'To be honest, my main thing is to work...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,123", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 - debounce 0.30s (is_complete=True, words=9)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,139", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=0d03fe2990ef model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,212", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,420", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=0d03fe2990ef payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,428", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=8 - 1 fragments  complete utterance (sentence_complete): 'To be honest, my main thing is to work...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,431", "level": "DEBUG", "message": "Transcript: Candidate[174]: To be honest, main thing is to work", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,433", "level": "INFO", "message": "[EVAL_GATE] turn=8 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,435", "level": "INFO", "message": "[SYNC_GATE] turn=8 | subscribing for eval result of turn=7 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,504", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=8 | result already in Redis (pre-check 69ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,506", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=7 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,507", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=7 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 4.6/6.5 (71% done, 1.9 more needed) | follow_ups=5 (opened_turn=0) | probe_rotation=2", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,508", "level": "INFO", "message": "[SCORES] turn=7 | clarity=1.0 depth=0.0 fluency=1.0 confidence=1.0 | overall=0.2 | integrity: 0→0 (Δ+0) | depth: 37→40 (Δ+3) | composite=16", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,509", "level": "INFO", "message": "[DECISION] turn=7 | action=PROBE | mode=verification | next_goal='The answer sounds rehearsed — probe real memory of the exact' | quality: clarity=1.0 depth=0.0 | overall=0.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,510", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=verification | follow_ups=5 | goal=The answer sounds rehearsed — probe real memory of the exact", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,511", "level": "INFO", "message": "[INJECT_FULL] turn=7 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (VERIFICATION) | NEXT MOVE: The answer sounds rehearsed — probe real memory of the exact moment, not the summary of it. | STYLE: Ask for something ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,511", "level": "INFO", "message": "[ROUTER] action=PROBE mode=verification turn=7 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,512", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=7 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,513", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=8 to eval_worker | answer='To be honest, main thing is to work' | question='Okay, that makes sense — you learned by researching and expe' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=4.6", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,517", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1353", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,519", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1353", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,522", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1353", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,542", "level": "INFO", "message": "[TRANSCRIPT] Partial save 14 lines, 174s duration, 6 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-1373", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,617", "level": "INFO", "message": "[SCORE] Saved 5 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-1374", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,669", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=7 (5 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-1374", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:12,800", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=8 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-1372", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:14,006", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for being straight with me. When you say your main thing is to work, can you tell me what part of the project you found yourself focusing on the most?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1364", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:14,008", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1364", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:14.118 DEBUG    livekit.agents     min endpointing delay updated: 0.8636366272931099 -> 0.8875785122780323
                                         {"reason": "pause between utterances", "pause": 1.103055477142334, "max_delay":
2.0, "min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:39:14,428", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:17,473", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=0d03fe2990ef model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:17,480", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=0d03fe2990ef model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:17,574", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=0d03fe2990ef close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:21,508", "level": "DEBUG", "message": "Transcript: Interviewer[183]: Thanks for being straight with me. When you say your main thing is to work, can you tell me what part of the project you found yourself focusing on the most?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:21,510", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=8 last_q='When you say your main thing is to work, can you tell me wha'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:21,511", "level": "INFO", "message": "✅ TURN 9 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:21,513", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:21,514", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:23,175", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:28.068 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So, like, I mean, I would like to go with hallucination
part.", "language": "en-US", "transcript_delay": 0.0004329681396484375, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:39:31,799", "level": "INFO", "message": "[TIMER] remaining=1007s turn=9", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:32.403 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Hallucination is something that a gives a lot of unusual
replies.", "language": "en-US", "transcript_delay": 0.029244422912597656, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:39:37.417 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So based on the training I did, a gave better replies
compared to", "language": "en-US", "transcript_delay": 0.04352092742919922, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:39:38.470 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 1.8881497859954834
                                         {"reason": "new turn", "pause": 0.881497859954834, "max_delay":
1.8881497859954834, "min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:39:38,821", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 fragment #1: 'So, like, I mean, I would like to go with hallucin...' (consolidated: 'So, like, I mean, I would like to go with hallucination part...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:38,823", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 - debounce 0.30s (is_complete=True, words=36)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:38,835", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=11789a5c1802 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,115", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=11789a5c1802 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,130", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=9 - 1 fragments  complete utterance (sentence_complete): 'So, like, I mean, I would like to go with hallucination part. Hallucination is s...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,131", "level": "DEBUG", "message": "Transcript: Candidate[200]: So, like, I mean, I would like to go with hallucination part. Hallucination is something that a gives a lot of unusual replies. So based on the training I did, a gave better replies compared to", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,131", "level": "INFO", "message": "[EVAL_GATE] turn=9 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,132", "level": "INFO", "message": "[SYNC_GATE] turn=9 | subscribing for eval result of turn=8 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:39.152 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "before what client was using.", "language": "en-US",
"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:39:39,206", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=9 | result already in Redis (pre-check 74ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,211", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=8 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,211", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=8 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 5.4/6.5 (83% done, 1.1 more needed) | follow_ups=6 (opened_turn=0) | probe_rotation=2", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,212", "level": "INFO", "message": "[SCORES] turn=8 | clarity=3.0 depth=1.0 fluency=5.0 confidence=4.0 | overall=1.5 | integrity: 0→0 (Δ+0) | depth: 40→68 (Δ+28) | composite=27", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,213", "level": "INFO", "message": "[SIGNAL] example_evasion layer=behavioral_confidence confidence=0.70 trust_delta=-0.15 visible=False turn=8", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,213", "level": "INFO", "message": "[SIGNAL] latency_mismatch layer=behavioral_confidence confidence=0.77 trust_delta=-0.10 visible=False turn=8", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,214", "level": "INFO", "message": "[DECISION] turn=8 | action=PROBE | mode=process | next_goal='Understand HOW they actually built or did the work — get int' | quality: clarity=3.0 depth=1.0 | overall=1.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,214", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=process | follow_ups=6 | goal=Understand HOW they actually built or did the work — get int", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,215", "level": "INFO", "message": "[INJECT_FULL] turn=8 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (PROCESS) | NEXT MOVE: Understand HOW they actually built or did the work — get into the specifics of their process. | STYLE: They've claimed owner", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,216", "level": "INFO", "message": "[ROUTER] action=PROBE mode=process turn=8 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,216", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=8 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,217", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=9 to eval_worker | answer='So, like, I mean, I would like to go with hallucination part' | question='Thanks for being straight with me. When you say your main th' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=5.4", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,222", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1521", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,224", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1521", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,227", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1521", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,260", "level": "INFO", "message": "[TRANSCRIPT] Partial save 16 lines, 200s duration, 7 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-1537", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,323", "level": "INFO", "message": "[SCORE] Saved 6 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-1546", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,372", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=8 (6 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-1546", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:39,803", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=9 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-1536", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:40,601", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"That's actually a smart call, focusing on A I responses to reduce hallucination is key. How did you measure or test that your A I was giving better, more accurate replies?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1532", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:40,602", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1532", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:41,026", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:45,246", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=11789a5c1802 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:45,251", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=11789a5c1802 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:45,320", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=11789a5c1802 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:50,696", "level": "DEBUG", "message": "Transcript: Interviewer[212]: That's actually a smart call—focusing on AI responses to reduce hallucination is key. How did you measure or test that your AI was giving better, more accurate replies?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:50,698", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=9 last_q='How did you measure or test that your AI was giving better, '", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:50,699", "level": "INFO", "message": "✅ TURN 10 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:50,703", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:50,705", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:39:53,861", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:39:57.693 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Sure. It might be, like,", "language": "en-US",
"transcript_delay": 0.010701417922973633, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:40:00.852 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I use it to train a lot of I use it to test a lot.",
"language": "en-US", "transcript_delay": 0.043154239654541016, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:40:02.871 DEBUG    livekit.agents     max endpointing delay updated due to pause: 1.8881497859954834 -> 2.0
                                         {"reason": "new turn", "pause": 3.1305503845214844, "max_delay": 2.0,
"min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:40:03,264", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 fragment #1: 'before what client was using. Sure. It might be, l...' (consolidated: 'before what client was using. Sure. It might be, like, I use...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,266", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 - debounce 0.30s (is_complete=True, words=25)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,272", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=5a02be3f6ca0 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,503", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=5a02be3f6ca0 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,570", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=10 - 1 fragments  complete utterance (sentence_complete): 'before what client was using. Sure. It might be, like, I use it to train a lot o...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,570", "level": "DEBUG", "message": "Transcript: Candidate[225]: before what client was using. Sure. It might be, like, I use it to train a lot of I use it to test a lot.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,571", "level": "INFO", "message": "[EVAL_GATE] turn=10 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,572", "level": "INFO", "message": "[SYNC_GATE] turn=10 | subscribing for eval result of turn=9 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:40:03.641 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Using real data, previous conversations, and some sort of
stuff.", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:40:03,670", "level": "INFO", "message": "[TRANSCRIPT] Partial save 18 lines, 225s duration, 8 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-1693", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,703", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=10 | result already in Redis (pre-check 131ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,703", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=9 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,704", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=9 topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 6.2/6.5 (95% done, 0.3 more needed) | follow_ups=7 (opened_turn=0) | probe_rotation=3", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,704", "level": "INFO", "message": "[SCORES] turn=9 | clarity=4.0 depth=2.0 fluency=4.0 confidence=4.0 | overall=2.5 | integrity: 0→0 (Δ+0) | depth: 68→71 (Δ+3) | composite=28", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,705", "level": "INFO", "message": "[DECISION] turn=9 | action=PROBE | mode=ownership | next_goal='Find out what was specifically theirs — what they personally' | quality: clarity=4.0 depth=2.0 | overall=2.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,707", "level": "INFO", "message": "[PROBE] DEEPER ON 'Multi Channel Lead Qualification System' | mode=ownership | follow_ups=7 | goal=Find out what was specifically theirs — what they personally", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,709", "level": "INFO", "message": "[INJECT_FULL] turn=9 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (OWNERSHIP) | NEXT MOVE: Find out what was specifically theirs — what they personally decided, built, or owned — not the team's. | STYLE: Anchor to", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,710", "level": "INFO", "message": "[ROUTER] action=PROBE mode=ownership turn=9 topic=Multi Channel Lead Qualification System (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,710", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=9 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,711", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=10 to eval_worker | answer='before what client was using. Sure. It might be, like, I use' | question=\"That's actually a smart call—focusing on AI responses to red\" | active_topic='Multi Channel Lead Qualification System' | topic_state_score=6.2", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,715", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1677", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,716", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1677", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,717", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1677", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,811", "level": "INFO", "message": "[SCORE] Saved 7 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-1702", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,860", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=9 (7 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-1702", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:03,998", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=10 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-1692", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,538", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-1688", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,538", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1688", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,540", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=5a02be3f6ca0 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,541", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=5a02be3f6ca0 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,542", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,542", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,548", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 already processed — dropping late fragment 'Using real data, previous conversations, and some sort of st'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,554", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=84d0dc25ebea model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,801", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=84d0dc25ebea payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,949", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1713", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,951", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1713", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:04,953", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1713", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:06,430", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Got it, so you used real past conversations to train and test the A I's responses. Can you describe a specific test or example where the A I’s improved reply made a clear difference for the client?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1723", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:06,431", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1723", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:06,754", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:13,899", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=84d0dc25ebea model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:13,900", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=84d0dc25ebea model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:13,971", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=84d0dc25ebea close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:22,650", "level": "DEBUG", "message": "Transcript: Interviewer[244]: Got it, so you used real past conversations to train and test the AI's responses. Can you describe a specific test or example where the AI’s improved reply made a clear difference for the client?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:22,651", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=10 last_q='Can you describe a specific test or example where the AI’s i'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:22,652", "level": "INFO", "message": "✅ TURN 11 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:22,653", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:22,653", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:40:27.579 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "And No.", "language": "en-US", "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:40:28,489", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 fragment #1: 'And No....' (consolidated: 'And No....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:28,491", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 - debounce 0.30s (is_complete=True, words=2)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:28,498", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=b2bd475e30f2 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:28,763", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=b2bd475e30f2 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:28,795", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=11 - 1 fragments  complete utterance (sentence_complete): 'And No....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-1876", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:28,797", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (2 words): 'And No.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1274, "taskName": "Task-1876", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:31,947", "level": "INFO", "message": "[TIMER] remaining=946s turn=11", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:32,951", "level": "INFO", "message": "[NUDGE] Soft nudge #1 sent at 10s silence", "logger": "interview-agent", "module": "agent_runtime", "line": 2754, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:33,720", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:40:35.118 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.458997488021851, "max_delay": 2.0,
"min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:40:36.102 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. Sorry. I'm not sure.", "language": "en-US",
"transcript_delay": 1.5341839790344238, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:40:43,891", "level": "WARNING", "message": "[LLM_GATE] ⏰ timed out (15s) — generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 277, "taskName": "Task-1861", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:43,892", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-1861", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:43,893", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-1861", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:45,343", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, no worries. Let’s switch gears a bit, tell me about your Sensex Analysis Project. What was one challenge you faced while collecting or processing the market data, and how did you tackle it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1872", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:45,345", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-1872", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:45,742", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:48,767", "level": "DEBUG", "message": "[TTS_SARVAM_WS_KEEPALIVE] request_id=b2bd475e30f2 ping_sent", "logger": "interview-agent", "module": "agent_providers", "line": 473, "taskName": "SarvamDirectSynthesizeStream.keepalive", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:50,626", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=b2bd475e30f2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:50,636", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=b2bd475e30f2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:50,694", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=b2bd475e30f2 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,852", "level": "DEBUG", "message": "Transcript: Interviewer[278]: Okay, no worries. Let’s switch gears a bit—tell me about your Sensex Analysis Project. What was one challenge you faced while collecting or processing the market data, and how did you tackle it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,853", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=11 last_q='What was one challenge you faced while collecting or process'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,854", "level": "INFO", "message": "✅ TURN 12 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,856", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,856", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,880", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=25e6cfa9b6e4 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,882", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Still with me, Vamsi? No rush at all.'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2017", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:56,882", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2017", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:57,136", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=25e6cfa9b6e4 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:57,554", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:58,681", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=25e6cfa9b6e4 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:58,683", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=25e6cfa9b6e4 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:40:58,762", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=25e6cfa9b6e4 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:00,418", "level": "WARNING", "message": "[TURN_GUARD] Blocking consecutive assistant turn (no candidate reply since last AI)", "logger": "interview-agent", "module": "agent_runtime", "line": 2166, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:00,422", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:00,423", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:02.700 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "They're working on the no rush at all.", "language":
"en-US", "transcript_delay": 28.132198572158813, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:02,738", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 fragment #1: 'No. Sorry. I'm not sure. They're working on the no...' (consolidated: 'No. Sorry. I'm not sure. They're working on the no rush at a...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:02,739", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 - debounce 0.30s (is_complete=True, words=13)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:02,752", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=318e34834ea8 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:02,995", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=318e34834ea8 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:03,046", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=12 - 1 fragments  complete utterance (sentence_complete): 'No. Sorry. I'm not sure. They're working on the no rush at all....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:03,049", "level": "DEBUG", "message": "Transcript: Candidate[284]: No. Sorry. I'm not sure. They're working on the no rush at all.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:03,061", "level": "INFO", "message": "[EVAL_GATE] turn=12 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:03,063", "level": "INFO", "message": "[SYNC_GATE] turn=12 | subscribing for eval result of turn=11 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:03,167", "level": "INFO", "message": "[TRANSCRIPT] Partial save 21 lines, 284s duration, 9 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-2087", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:04,772", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,007", "level": "WARNING", "message": "[SYNC_GATE] turn=12 | pubsub error: ", "logger": "interview-agent", "module": "agent_runtime", "line": 2063, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:08.373 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 23.008686304092407, "max_delay": 2.0,
"min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:08,492", "level": "WARNING", "message": "[SYNC_GATE] ⏰ turn=12 | timeout 4.5s — clearing stale directives before releasing LLM", "logger": "interview-agent", "module": "agent_runtime", "line": 2104, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,494", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=12 to eval_worker | answer=\"No. Sorry. I'm not sure. They're working on the no rush at a\" | question='Got it, so you used real past conversations to train and tes' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=6.2", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,497", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2069", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,498", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2069", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,499", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2069", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,791", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=12 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-2086", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:08.903 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. I I am not sure about ten seven six. I don't know. I
didn't remember that.", "language": "en-US", "transcript_delay": 1.0932564735412598, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:08,943", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-2080", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,944", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2080", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,950", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=318e34834ea8 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,954", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=318e34834ea8 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,970", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,971", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:08,986", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 already processed — dropping late fragment 'No. I I am not sure about ten seven six. I don't know. I did'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:09,000", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=0993097ecc38 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:09,290", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=0993097ecc38 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:09,383", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2113", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:09,384", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2113", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:09,385", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2113", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:10,985", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for being honest, I appreciate that. Let’s try a different angle, when you worked on cleaning and analyzing the Sensex data, what tools or methods did you find most helpful to handle messy or large datasets?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2123", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:10,986", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2123", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:11,331", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:16,712", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=0993097ecc38 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:16,715", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=0993097ecc38 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:16,786", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=0993097ecc38 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:23,255", "level": "DEBUG", "message": "Transcript: Interviewer[304]: Thanks for being honest, I appreciate that. Let’s try a different angle—when you worked on cleaning and analyzing the Sensex data, what tools or methods did you find most helpful to handle messy or large datasets?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:23,256", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=12 last_q='Let’s try a different angle—when you worked on cleaning and '", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:23,256", "level": "INFO", "message": "✅ TURN 13 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:23,258", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:23,258", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:28.540 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Okay.", "language": "en-US", "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:29,449", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 fragment #1: 'Okay....' (consolidated: 'Okay....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:29,452", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 - debounce 4.00s (is_complete=False, words=1)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:29,471", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=d973ed455a9e model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:29,734", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=d973ed455a9e payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:31,418", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:32,148", "level": "INFO", "message": "[TIMER] remaining=886s turn=13", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:32.515 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 3.529921054840088, "max_delay": 2.0,
"min_delay": 0.8875785122780323, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:41:33.007 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So I understood.", "language": "en-US",
"transcript_delay": 1.0289850234985352, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:33,462", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=13 - 1 fragments  complete utterance (debounce_timeout): 'Okay....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2288", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:33,463", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (1 words): 'Okay.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1274, "taskName": "Task-2288", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:38,025", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:41:39.318 DEBUG    livekit.agents     min endpointing delay updated: 0.8875785122780323 -> 1.4008973345579194
                                         {"reason": "pause between utterances", "pause": 6.020766735076904, "max_delay":
2.0, "min_delay": 1.4008973345579194, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:41:40.694 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I don't know what to say.", "language": "en-US",
"transcript_delay": 1.9259834289550781, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:41:40,715", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-2270", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,716", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2270", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,722", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=d973ed455a9e model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 514, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,731", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=d973ed455a9e close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,741", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,742", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,763", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 already processed — dropping late fragment 'So I understood. I don't know what to say.'", "logger": "interview-agent", "module": "agent_runtime", "line": 2275, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:40,773", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=0db4f0354a8e model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:41,052", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=0db4f0354a8e payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:51,180", "level": "INFO", "message": "[NUDGE] Soft nudge #1 sent at 10s silence", "logger": "interview-agent", "module": "agent_runtime", "line": 2754, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:56,161", "level": "WARNING", "message": "[LLM_GATE] ⏰ timed out (15s) — generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 277, "taskName": "Task-2315", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:56,162", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2315", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:56,163", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2315", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:57,540", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'No worries, Vamsi. Take your time, what’s the first thing that comes to mind when you think about handling data in that project? Even a rough idea is totally fine.'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2325", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:57,541", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2325", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:41:57,875", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:01,073", "level": "DEBUG", "message": "[TTS_SARVAM_WS_KEEPALIVE] request_id=0db4f0354a8e ping_sent", "logger": "interview-agent", "module": "agent_providers", "line": 473, "taskName": "SarvamDirectSynthesizeStream.keepalive", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:02,330", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=0db4f0354a8e model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:02,336", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=0db4f0354a8e model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:02,418", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=0db4f0354a8e close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,039", "level": "DEBUG", "message": "Transcript: Interviewer[349]: No worries, Vamsi. Take your time—what’s the first thing that comes to mind when you think about handling data in that project? Even a rough idea is totally fine.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,041", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=13 last_q='Even a rough idea is totally fine.'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,042", "level": "INFO", "message": "✅ TURN 14 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,045", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,046", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,058", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=7b463bee8f87 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,060", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Still with me, Vamsi? No rush at all.'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2456", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,062", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2456", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,323", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=7b463bee8f87 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:08,697", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:09,747", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=7b463bee8f87 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:09,752", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=7b463bee8f87 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:09,826", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=7b463bee8f87 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:11,205", "level": "WARNING", "message": "[TURN_GUARD] Blocking consecutive assistant turn (no candidate reply since last AI)", "logger": "interview-agent", "module": "agent_runtime", "line": 2166, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:11,208", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:11,209", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:13,617", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:42:15.069 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 29.951258897781372, "max_delay": 2.0,
"min_delay": 1.4008973345579194, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:42:15.662 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I don't know really. I am not sure.", "language": "en-US",
"transcript_delay": 1.141512393951416, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:42:15,927", "level": "DEBUG", "message": "[STT_BUFFER] turn=14 fragment #1: 'I don't know really. I am not sure....' (consolidated: 'I don't know really. I am not sure....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:15,927", "level": "DEBUG", "message": "[STT_BUFFER] turn=14 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:15,930", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=c3670f0c57f2 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,163", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=c3670f0c57f2 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,230", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=14 - 1 fragments  complete utterance (sentence_complete): 'I don't know really. I am not sure....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,231", "level": "DEBUG", "message": "Transcript: Candidate[357]: I don't know really. I am not sure.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,234", "level": "INFO", "message": "[EVAL_GATE] turn=14 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,239", "level": "INFO", "message": "[SYNC_GATE] turn=14 | subscribing for eval result of turn=13 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:16,660", "level": "INFO", "message": "[TRANSCRIPT] Partial save 24 lines, 357s duration, 10 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-2526", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,099", "level": "WARNING", "message": "[SYNC_GATE] turn=14 | pubsub error: ", "logger": "interview-agent", "module": "agent_runtime", "line": 2063, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,594", "level": "WARNING", "message": "[SYNC_GATE] ⏰ turn=14 | timeout 4.5s — clearing stale directives before releasing LLM", "logger": "interview-agent", "module": "agent_runtime", "line": 2104, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,595", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=14 to eval_worker | answer=\"I don't know really. I am not sure.\" | question='Thanks for being honest, I appreciate that. Let’s try a diff' | active_topic='Multi Channel Lead Qualification System' | topic_state_score=6.2", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,598", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2511", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,599", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2511", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,600", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2511", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:21,892", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=14 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-2525", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:23,449", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That’s okay. Let’s talk about a different project then, the Campaign Metrics and Slack Reporting System you built. Can you share how you set up the automation to send live campaign data into Slack?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2522", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:23,451", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2522", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:23,865", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:28,286", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=c3670f0c57f2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:28,300", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=c3670f0c57f2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:28,385", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=c3670f0c57f2 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:32,304", "level": "INFO", "message": "[TIMER] remaining=826s turn=14", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:33,975", "level": "DEBUG", "message": "Transcript: Interviewer[375]: That’s okay. Let’s talk about a different project then — the Campaign Metrics and Slack Reporting System you built. Can you share how you set up the automation to send live campaign data into Slack?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:33,976", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=14 last_q='Can you share how you set up the automation to send live cam'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:33,977", "level": "INFO", "message": "✅ TURN 15 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:33,978", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:33,978", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:42:35.073 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Slack reporting system. Can you share how to spend that
automation system by", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:42:36,495", "level": "DEBUG", "message": "[STT_BUFFER] turn=15 fragment #1: 'Slack reporting system. Can you share how to spend...' (consolidated: 'Slack reporting system. Can you share how to spend that auto...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,497", "level": "DEBUG", "message": "[STT_BUFFER] turn=15 - debounce 0.30s (is_complete=True, words=13)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,501", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=c205a58a3852 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,751", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=c205a58a3852 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,800", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=15 - 1 fragments  complete utterance (sentence_complete): 'Slack reporting system. Can you share how to spend that automation system by...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,802", "level": "DEBUG", "message": "Transcript: Candidate[378]: Slack reporting system. Can you share how to spend that automation system", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,803", "level": "INFO", "message": "[EVAL_GATE] turn=15 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,804", "level": "INFO", "message": "[SYNC_GATE] turn=15 | subscribing for eval result of turn=14 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,894", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=15 | result already in Redis (pre-check 89ms) | action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,895", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=14 action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,896", "level": "INFO", "message": "[MOVE_ON] ✅ topic change turn=14 | 'Multi Channel Lead Qualification System' → 'Sensex Analysis Project' | covered=1 topics", "logger": "interview-agent", "module": "agent_runtime", "line": 1570, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,896", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=14 topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 more needed) | follow_ups=0 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,897", "level": "INFO", "message": "[SCORES] turn=14 | clarity=2.0 depth=0.0 fluency=5.0 confidence=1.0 | overall=0.5 | integrity: 0→0 (Δ+0) | depth: 71→74 (Δ+3) | composite=30", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,898", "level": "INFO", "message": "[DECISION] turn=14 | action=MOVE_ON | mode=evidence | next_goal='Acknowledge briefly and move to: Sensex Analysis Project. As' | quality: clarity=2.0 depth=0.0 | overall=0.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,898", "level": "INFO", "message": "[MOVE_ON] SWITCHING TOPIC | from='Multi Channel Lead Qualification System' to='Sensex Analysis Project' | covered_so_far=1 topics | covered_keys=['multi channel lead qualification system']", "logger": "interview-agent", "module": "agent_runtime", "line": 1751, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,898", "level": "INFO", "message": "[MOVE_ON_HISTORY_TRIM] Dropped 0 old-topic msg(s) from chat_ctx | full wipe (0 non-sys kept) | new_topic=Sensex Analysis Project", "logger": "interview-agent", "module": "agent_runtime", "line": 1822, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,899", "level": "INFO", "message": "[INJECT_FULL] turn=14 action=MOVE_ON | old_directive_existed=False | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: MOVE_ON | NEW ACTIVE TOPIC: Sensex Analysis Project | YOUR ONLY JOB THIS TURN: Acknowledge briefly and move to: Sensex Analysis Project. Ask one focused ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,900", "level": "INFO", "message": "[TOPIC_LOCK] Injected for new topic: Sensex Analysis Project | RECENT_CONTEXT cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 1858, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,901", "level": "INFO", "message": "[ROUTER] action=MOVE_ON mode=evidence turn=14 topic=Sensex Analysis Project (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,902", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=14 action=MOVE_ON)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,904", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=15 to eval_worker | answer='Slack reporting system. Can you share how to spend that auto' | question='That’s okay. Let’s talk about a different project then — the' | active_topic='Sensex Analysis Project' | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,907", "level": "INFO", "message": "[TRANSCRIPT] Partial save 26 lines, 378s duration, 11 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-2675", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,908", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2659", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,909", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2659", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:36,910", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2659", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:37,291", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=15 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-2674", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:37,375", "level": "INFO", "message": "[SCORE] Saved 8 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-2676", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:37,424", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=14 (8 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-2676", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:37,469", "level": "INFO", "message": "[CHECKPOINT] Flushed 2 AI signal(s) to DB for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 899, "taskName": "Task-2677", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:38,230", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Sure! What I’m really curious about is how you decided what data to send into Slack and how you made sure it was useful for the teams using it. What was your thought process there?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2670", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:38,230", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2670", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:38,639", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:39,075", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:42:39.353 DEBUG    livekit.agents     interruption detected
                                         {"total_duration": 0.1743851, "prediction_duration": 0.015956879,
"detection_delay": 0.33720850944519043, "probability": 0.9004479646682739, "session_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id":
"org-vamsi-2336", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate":
"Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:42:40.711 DEBUG    livekit.agents     max endpointing delay updated: 2.0 -> 2.0
                                         {"reason": "new turn (interruption)", "pause": 24.144304990768433, "max_delay":
2.0, "min_delay": 1.4008973345579194, "between_utterance_delay": 24.517187356948853, "between_turn_delay":
24.144304990768433, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:42:43,891", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=c205a58a3852 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:43,900", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=c205a58a3852 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:43,981", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=c205a58a3852 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:50,395", "level": "DEBUG", "message": "Transcript: Interviewer[391]: Sure! What I’m really curious about is how you decided what data to send into Slack and how you made sure it was useful for the teams using it. What was your thought process there?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:50,396", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=15 last_q='What was your thought process there?'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:50,396", "level": "INFO", "message": "✅ TURN 16 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:50,399", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:50,400", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:52,366", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:42:54.819 DEBUG    livekit.agents     min endpointing delay updated: 1.4008973345579194 -> 2.0
                                         {"reason": "pause between utterances", "pause": 12.16707992553711, "max_delay":
2.0, "min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:42:55.090 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I don't know. I am very stuck with this project.",
"language": "en-US", "transcript_delay": 0.8303887844085693, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:42:55.996 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I don't know.", "language": "en-US", "transcript_delay":
1.7361302375793457, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:42:56,266", "level": "DEBUG", "message": "[STT_BUFFER] turn=16 fragment #1: 'I don't know. I am very stuck with this project. I...' (consolidated: 'I don't know. I am very stuck with this project. I don't kno...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,268", "level": "DEBUG", "message": "[STT_BUFFER] turn=16 - debounce 0.30s (is_complete=True, words=13)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,272", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=3c47da765d8d model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,498", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=3c47da765d8d payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,570", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=16 - 1 fragments  complete utterance (sentence_complete): 'I don't know. I am very stuck with this project. I don't know....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,571", "level": "DEBUG", "message": "Transcript: Candidate[398]: I don't know. I am very stuck with this project. I don't know.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,572", "level": "INFO", "message": "[EVAL_GATE] turn=16 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,572", "level": "INFO", "message": "[SYNC_GATE] turn=16 | subscribing for eval result of turn=15 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,670", "level": "INFO", "message": "[TRANSCRIPT] Partial save 28 lines, 398s duration, 12 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-2841", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,696", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=16 | result already in Redis (pre-check 123ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,696", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=15 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,698", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=15 topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.8/6.5 (12% done, 5.7 more needed) | follow_ups=1 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,700", "level": "INFO", "message": "[SCORES] turn=15 | clarity=2.0 depth=0.0 fluency=2.0 confidence=1.0 | overall=0.5 | integrity: 0→0 (Δ+0) | depth: 74→92 (Δ+18) | composite=37", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,701", "level": "INFO", "message": "[SIGNAL] example_evasion layer=behavioral_confidence confidence=0.70 trust_delta=-0.15 visible=False turn=15", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,701", "level": "INFO", "message": "[DECISION] turn=15 | action=PROBE | mode=process | next_goal='Understand HOW they actually built or did the work — get int' | quality: clarity=2.0 depth=0.0 | overall=0.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,702", "level": "INFO", "message": "[PROBE] DEEPER ON 'Sensex Analysis Project' | mode=process | follow_ups=1 | goal=Understand HOW they actually built or did the work — get int", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,702", "level": "INFO", "message": "[INJECT_FULL] turn=15 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (PROCESS) | NEXT MOVE: Understand HOW they actually built or did the work — get into the specifics of their process. | STYLE: They've claimed owner", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,703", "level": "INFO", "message": "[ROUTER] action=PROBE mode=process turn=15 topic=Sensex Analysis Project (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,704", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=15 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,704", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=16 to eval_worker | answer=\"I don't know. I am very stuck with this project. I don't kno\" | question='Sure! What I’m really curious about is how you decided what ' | active_topic='Sensex Analysis Project' | topic_state_score=0.8", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,706", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2825", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,706", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2825", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,707", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2825", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,795", "level": "INFO", "message": "[SCORE] Saved 9 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-2843", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,838", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=15 (9 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-2843", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:56,994", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=16 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-2840", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:58,473", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'No worries, Vamsi. Let’s back up a bit, think about one small part of that project where you felt you made a clear impact or learned something new. What comes to mind first?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2836", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:58,474", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2836", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:42:58,873", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:43:01.111 DEBUG    livekit.agents     flush audio emitter due to slow audio generation
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:43:03,827", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=3c47da765d8d model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:03,829", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=3c47da765d8d model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:03,880", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=3c47da765d8d close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:11,387", "level": "DEBUG", "message": "Transcript: Interviewer[412]: No worries, Vamsi. Let’s back up a bit — think about one small part of that project where you felt you made a clear impact or learned something new. What comes to mind first?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:11,390", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=16 last_q='What comes to mind first?'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:11,391", "level": "INFO", "message": "✅ TURN 17 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:11,392", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:11,393", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:15,112", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:43:18.063 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.628669261932373, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:43:18.505 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Don't know. I did work on any many projects much.",
"language": "en-US", "transcript_delay": 0.9409177303314209, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"app_id": "app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:43:19,571", "level": "DEBUG", "message": "[STT_BUFFER] turn=17 fragment #1: 'Don't know. I did work on any many projects much....' (consolidated: 'Don't know. I did work on any many projects much....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,571", "level": "DEBUG", "message": "[STT_BUFFER] turn=17 - debounce 0.30s (is_complete=True, words=10)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,576", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=59f35fe5d23f model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,874", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=17 - 1 fragments  complete utterance (sentence_complete): 'Don't know. I did work on any many projects much....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,876", "level": "DEBUG", "message": "Transcript: Candidate[421]: Don't know. I did work on any many projects much.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,878", "level": "INFO", "message": "[EVAL_GATE] turn=17 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:19,878", "level": "INFO", "message": "[SYNC_GATE] turn=17 | subscribing for eval result of turn=16 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:20,090", "level": "DEBUG", "message": "[SYNC_GATE] turn=17 | pre-check miss (will use pubsub): ", "logger": "interview-agent", "module": "agent_runtime", "line": 2014, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:20,240", "level": "INFO", "message": "[TRANSCRIPT] Partial save 30 lines, 421s duration, 13 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-2995", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:21,971", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=59f35fe5d23f payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,520", "level": "WARNING", "message": "[SYNC_GATE] turn=17 | pubsub error: ", "logger": "interview-agent", "module": "agent_runtime", "line": 2063, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,989", "level": "WARNING", "message": "[SYNC_GATE] ⏰ turn=17 | timeout 4.5s — clearing stale directives before releasing LLM", "logger": "interview-agent", "module": "agent_runtime", "line": 2104, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,990", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=17 to eval_worker | answer=\"Don't know. I did work on any many projects much.\" | question='No worries, Vamsi. Let’s back up a bit — think about one sma' | active_topic='Sensex Analysis Project' | topic_state_score=0.8", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,991", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2979", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,991", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-2979", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:25,992", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-2979", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:26,290", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=17 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-2994", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:27,417", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for being honest about that. Let’s try a different approach, tell me about a time during your internship at Niti A I when you had to learn something completely new quickly. How did you approach it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2990", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:27,419", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-2990", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:27,812", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:43:28.001 DEBUG    livekit.agents     flush audio emitter due to slow audio generation
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:43:32,620", "level": "INFO", "message": "[TIMER] remaining=766s turn=17", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:33,864", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=59f35fe5d23f model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:33,867", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=59f35fe5d23f model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:33,925", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=59f35fe5d23f close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:45,546", "level": "DEBUG", "message": "Transcript: Interviewer[447]: Thanks for being honest about that. Let’s try a different approach — tell me about a time during your internship at Niti AI when you had to learn something completely new quickly. How did you approach it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:45,548", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=17 last_q='How did you approach it?'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:45,549", "level": "INFO", "message": "✅ TURN 18 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:45,550", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:45,550", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:48,077", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:43:50.099 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. Sorry.", "language": "en-US", "transcript_delay":
0.08813095092773438, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:43:50.568 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 10.32399296760559, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:43:51.534 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Don't know about this as well.", "language": "en-US",
"transcript_delay": 1.5226995944976807, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:43:52,020", "level": "DEBUG", "message": "[STT_BUFFER] turn=18 fragment #1: 'No. Sorry. Don't know about this as well....' (consolidated: 'No. Sorry. Don't know about this as well....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,021", "level": "DEBUG", "message": "[STT_BUFFER] turn=18 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,025", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=9a930c6cacd6 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,261", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=9a930c6cacd6 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,336", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=18 - 1 fragments  complete utterance (sentence_complete): 'No. Sorry. Don't know about this as well....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,338", "level": "DEBUG", "message": "Transcript: Candidate[453]: No. Sorry. Don't know about this as well.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,339", "level": "INFO", "message": "[EVAL_GATE] turn=18 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,339", "level": "INFO", "message": "[SYNC_GATE] turn=18 | subscribing for eval result of turn=17 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,392", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=18 | result already in Redis (pre-check 53ms) | action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,393", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=17 action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,393", "level": "INFO", "message": "[MOVE_ON] ✅ topic change turn=17 | 'Sensex Analysis Project' → 'Campaign Metrics and Slack Reporting System' | covered=2 topics", "logger": "interview-agent", "module": "agent_runtime", "line": 1570, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,394", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=17 topic='Campaign Metrics and Slack Reporting System' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 more needed) | follow_ups=0 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,394", "level": "INFO", "message": "[SCORES] turn=17 | clarity=2.0 depth=1.0 fluency=2.0 confidence=1.0 | overall=1.2 | integrity: 0→0 (Δ+0) | depth: 92→100 (Δ+9) | composite=40", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,394", "level": "INFO", "message": "[SIGNAL] depth_decay layer=intelligence_quality confidence=0.61 trust_delta=-0.06 visible=True turn=17", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,395", "level": "INFO", "message": "[DECISION] turn=17 | action=MOVE_ON | mode=normal | next_goal='Acknowledge briefly and move to: Campaign Metrics and Slack ' | quality: clarity=2.0 depth=1.0 | overall=1.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,395", "level": "INFO", "message": "[MOVE_ON] SWITCHING TOPIC | from='Sensex Analysis Project' to='Campaign Metrics and Slack Reporting Sys' | covered_so_far=2 topics | covered_keys=['sensex analysis project', 'multi channel lead qualification system']", "logger": "interview-agent", "module": "agent_runtime", "line": 1751, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,395", "level": "INFO", "message": "[MOVE_ON_HISTORY_TRIM] Dropped 0 old-topic msg(s) from chat_ctx | full wipe (0 non-sys kept) | new_topic=Campaign Metrics and Slack Reporting System", "logger": "interview-agent", "module": "agent_runtime", "line": 1822, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,396", "level": "INFO", "message": "[INJECT_FULL] turn=17 action=MOVE_ON | old_directive_existed=False | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: MOVE_ON | NEW ACTIVE TOPIC: Campaign Metrics and Slack Reporting System | YOUR ONLY JOB THIS TURN: Acknowledge briefly and move to: Campaign Metrics and ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,397", "level": "INFO", "message": "[TOPIC_LOCK] Injected for new topic: Campaign Metrics and Slack Reporting System | RECENT_CONTEXT cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 1858, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,397", "level": "INFO", "message": "[ROUTER] action=MOVE_ON mode=normal turn=17 topic=Campaign Metrics and Slack Reporting Sys (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,401", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=17 action=MOVE_ON)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,402", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=18 to eval_worker | answer=\"No. Sorry. Don't know about this as well.\" | question='Thanks for being honest about that. Let’s try a different ap' | active_topic='Campaign Metrics and Slack Reporting System' | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,419", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-3153", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,420", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-3153", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,420", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-3153", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,447", "level": "INFO", "message": "[TRANSCRIPT] Partial save 32 lines, 453s duration, 14 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-3170", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,502", "level": "INFO", "message": "[SCORE] Saved 10 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-3171", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,553", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=17 (10 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-3171", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:52,691", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=18 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-3169", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:53,894", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That’s okay, Vamsi. Let’s try something different, imagine you were given a new tool to work with for a campaign automation, but the documentation was limited. What would be your first steps to figure out how to use it effectively?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3164", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:53,895", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-3164", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:54,332", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:59,961", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=9a930c6cacd6 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:43:59,963", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=9a930c6cacd6 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:00,012", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=9a930c6cacd6 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:07,082", "level": "DEBUG", "message": "Transcript: Interviewer[468]: That’s okay, Vamsi. Let’s try something different — imagine you were given a new tool to work with for a campaign automation, but the documentation was limited. What would be your first steps to figure out how to use it effectively?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:07,082", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=18 last_q='What would be your first steps to figure out how to use it e'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:07,083", "level": "INFO", "message": "✅ TURN 19 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:07,084", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:07,084", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:12,323", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:44:14.162 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.33866286277771, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:44:14.879 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Okay. I am not sure.", "language": "en-US",
"transcript_delay": 1.257263422012329, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:44:15,626", "level": "DEBUG", "message": "[STT_BUFFER] turn=19 fragment #1: 'Okay. I am not sure....' (consolidated: 'Okay. I am not sure....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,626", "level": "DEBUG", "message": "[STT_BUFFER] turn=19 - debounce 0.30s (is_complete=True, words=5)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,631", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=a0ecb460e32d model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,862", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=a0ecb460e32d payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,938", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=19 - 1 fragments  complete utterance (sentence_complete): 'Okay. I am not sure....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,938", "level": "DEBUG", "message": "Transcript: Candidate[477]: Okay. I am not sure.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,939", "level": "INFO", "message": "[EVAL_GATE] turn=19 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,940", "level": "INFO", "message": "[SYNC_GATE] turn=19 | subscribing for eval result of turn=18 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,993", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=19 | result already in Redis (pre-check 53ms) | action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,993", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=18 action=MOVE_ON", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,994", "level": "INFO", "message": "[MOVE_ON] ✅ topic change turn=18 | 'Campaign Metrics and Slack Reporting System' → 'Personal Brand & Marketing Automation Strategist' | covered=3 topics", "logger": "interview-agent", "module": "agent_runtime", "line": 1570, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,994", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=18 topic='Personal Brand & Marketing Automation Strategist' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 more needed) | follow_ups=0 (opened_turn=0) | probe_rotation=0", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,994", "level": "INFO", "message": "[SCORES] turn=18 | clarity=1.0 depth=0.0 fluency=2.0 confidence=1.0 | overall=0.2 | integrity: 0→0 (Δ+0) | depth: 100→100 (Δ+24) | composite=40", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,995", "level": "INFO", "message": "[SIGNAL] example_evasion layer=behavioral_confidence confidence=0.70 trust_delta=-0.15 visible=False turn=18", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,996", "level": "INFO", "message": "[SIGNAL] depth_decay layer=intelligence_quality confidence=0.61 trust_delta=-0.06 visible=True turn=18", "logger": "interview-agent", "module": "agent_runtime", "line": 1693, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,996", "level": "INFO", "message": "[DECISION] turn=18 | action=MOVE_ON | mode=process | next_goal='Acknowledge briefly and move to: Personal Brand & Marketing ' | quality: clarity=1.0 depth=0.0 | overall=0.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,997", "level": "INFO", "message": "[MOVE_ON] SWITCHING TOPIC | from='Campaign Metrics and Slack Reporting Sys' to='Personal Brand & Marketing Automation St' | covered_so_far=3 topics | covered_keys=['campaign metrics and slack reporting system', 'sensex analysis project', 'multi channel lead qualification system']", "logger": "interview-agent", "module": "agent_runtime", "line": 1751, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,997", "level": "INFO", "message": "[MOVE_ON_HISTORY_TRIM] Dropped 0 old-topic msg(s) from chat_ctx | full wipe (0 non-sys kept) | new_topic=Personal Brand & Marketing Automation Strategist", "logger": "interview-agent", "module": "agent_runtime", "line": 1822, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,997", "level": "INFO", "message": "[INJECT_FULL] turn=18 action=MOVE_ON | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: MOVE_ON | NEW ACTIVE TOPIC: Personal Brand & Marketing Automation Strategist | YOUR ONLY JOB THIS TURN: Acknowledge briefly and move to: Personal Brand &", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,998", "level": "INFO", "message": "[TOPIC_LOCK] Injected for new topic: Personal Brand & Marketing Automation Strategist | RECENT_CONTEXT cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 1858, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,998", "level": "INFO", "message": "[ROUTER] action=MOVE_ON mode=process turn=18 topic=Personal Brand & Marketing Automation St (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,998", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=18 action=MOVE_ON)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:15,999", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=19 to eval_worker | answer='Okay. I am not sure.' | question='That’s okay, Vamsi. Let’s try something different — imagine ' | active_topic='Personal Brand & Marketing Automation Strategist' | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,030", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-3322", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,033", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-3322", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,034", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-3322", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,061", "level": "INFO", "message": "[TRANSCRIPT] Partial save 34 lines, 477s duration, 15 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-3338", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,110", "level": "INFO", "message": "[SCORE] Saved 11 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-3339", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,152", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=18 (11 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-3339", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,289", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=19 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-3337", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:16,525", "level": "INFO", "message": "[CHECKPOINT] Flushed 4 AI signal(s) to DB for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 899, "taskName": "Task-3340", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:18,252", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Take your time, what’s the first thing you’d probably try or look for in that situation?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3333", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:18,253", "level": "INFO", "message": "[TTS] Streamed 1 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-3333", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:18,649", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:20,520", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=a0ecb460e32d model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:20,521", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=a0ecb460e32d model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:20,569", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=a0ecb460e32d close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:23,366", "level": "DEBUG", "message": "Transcript: Interviewer[484]: Take your time — what’s the first thing you’d probably try or look for in that situation?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:23,367", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=19 last_q='Take your time — what’s the first thing you’d probably try o'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:23,367", "level": "INFO", "message": "✅ TURN 20 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:23,368", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:23,369", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:24,468", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:44:25.820 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.062156438827515, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:44:26.456 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I'm not sure. Sorry.", "language": "en-US",
"transcript_delay": 1.194561243057251, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:44:27,270", "level": "DEBUG", "message": "[STT_BUFFER] turn=20 fragment #1: 'I'm not sure. Sorry....' (consolidated: 'I'm not sure. Sorry....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,270", "level": "DEBUG", "message": "[STT_BUFFER] turn=20 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,275", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=606b16758f2f model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,587", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=20 - 1 fragments  complete utterance (sentence_complete): 'I'm not sure. Sorry....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,588", "level": "DEBUG", "message": "Transcript: Candidate[489]: I'm not sure. Sorry.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,589", "level": "INFO", "message": "[EVAL_GATE] turn=20 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,590", "level": "INFO", "message": "[SYNC_GATE] turn=20 | subscribing for eval result of turn=19 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,697", "level": "INFO", "message": "[TRANSCRIPT] Partial save 36 lines, 489s duration, 16 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-3446", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,698", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=20 | result already in Redis (pre-check 109ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,699", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=19 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,699", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=19 topic='Personal Brand & Marketing Automation Strategist' | importance=HIGH | saturated=False | progress: 0.8/6.5 (12% done, 5.7 more needed) | follow_ups=1 (opened_turn=0) | probe_rotation=1", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,700", "level": "INFO", "message": "[SCORES] turn=19 | clarity=2.0 depth=0.0 fluency=5.0 confidence=1.0 | overall=0.5 | integrity: 0→0 (Δ+0) | depth: 100→100 (Δ+3) | composite=40", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,700", "level": "INFO", "message": "[DECISION] turn=19 | action=PROBE | mode=evidence | next_goal='They claimed a skill or capability but gave zero real instan' | quality: clarity=2.0 depth=0.0 | overall=0.5", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,700", "level": "INFO", "message": "[PROBE] DEEPER ON 'Personal Brand & Marketing Automation St' | mode=evidence | follow_ups=1 | goal=They claimed a skill or capability but gave zero real instan", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,701", "level": "INFO", "message": "[INJECT_FULL] turn=19 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (EVIDENCE) | NEXT MOVE: They claimed a skill or capability but gave zero real instance of actually using it — get a specific moment. | STYLE: Move ", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,701", "level": "INFO", "message": "[ROUTER] action=PROBE mode=evidence turn=19 topic=Personal Brand & Marketing Automation St (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,701", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=19 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,702", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=20 to eval_worker | answer=\"I'm not sure. Sorry.\" | question='Take your time — what’s the first thing you’d probably try o' | active_topic='Personal Brand & Marketing Automation Strategist' | topic_state_score=0.8", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,703", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-3430", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,704", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-3430", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,704", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-3430", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,804", "level": "INFO", "message": "[SCORE] Saved 12 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-3448", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,807", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=606b16758f2f payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,848", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=19 (12 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-3448", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:27,990", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=20 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-3445", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:29,132", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'No worries at all. Let’s try one last thing, tell me about a time, even outside of work or projects, when you faced a challenge and how you went about solving it.'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3441", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:29,134", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-3441", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:29,537", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:44:31.535 DEBUG    livekit.agents     flush audio emitter due to slow audio generation
                                         {"session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:44:32,991", "level": "INFO", "message": "[TIMER] remaining=705s turn=20", "logger": "interview-agent", "module": "agent_runtime", "line": 2640, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:33,619", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=606b16758f2f model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:33,622", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=606b16758f2f model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:33,669", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=606b16758f2f close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:39,163", "level": "DEBUG", "message": "Transcript: Interviewer[500]: No worries at all. Let’s try one last thing—tell me about a time, even outside of work or projects, when you faced a challenge and how you went about solving it.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:39,164", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=20 last_q='Let’s try one last thing—tell me about a time, even outside '", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:39,165", "level": "INFO", "message": "✅ TURN 21 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:39,166", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:39,166", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:40,865", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:44:42.378 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.292791366577148, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
    22:44:43.774 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I didn't solve anything.", "language": "en-US",
"transcript_delay": 1.9594745635986328, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:44:43,829", "level": "DEBUG", "message": "[STT_BUFFER] turn=21 fragment #1: 'I didn't solve anything....' (consolidated: 'I didn't solve anything....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2293, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:43,829", "level": "DEBUG", "message": "[STT_BUFFER] turn=21 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2380, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:43,834", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=dcb7c57db4bf model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 168, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,052", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=dcb7c57db4bf payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 231, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,136", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=21 - 1 fragments  complete utterance (sentence_complete): 'I didn't solve anything....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,136", "level": "DEBUG", "message": "Transcript: Candidate[505]: I didn't solve anything.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,137", "level": "INFO", "message": "[EVAL_GATE] turn=21 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1369, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,138", "level": "INFO", "message": "[SYNC_GATE] turn=21 | subscribing for eval result of turn=20 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1991, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,189", "level": "INFO", "message": "[SYNC_GATE] ✅ turn=21 | result already in Redis (pre-check 52ms) | action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 2005, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,190", "level": "INFO", "message": "[REDIS_EVAL] Applying pre-computed result turn=20 action=PROBE", "logger": "interview-agent", "module": "agent_runtime", "line": 1530, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,190", "level": "INFO", "message": "[TOPIC_STATE_APPLY] turn=20 topic='Personal Brand & Marketing Automation Strategist' | importance=HIGH | saturated=False | progress: 1.6/6.5 (25% done, 4.9 more needed) | follow_ups=2 (opened_turn=0) | probe_rotation=2", "logger": "interview-agent", "module": "agent_runtime", "line": 1603, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,191", "level": "INFO", "message": "[SCORES] turn=20 | clarity=1.0 depth=0.0 fluency=1.0 confidence=1.0 | overall=0.2 | integrity: 0→0 (Δ+0) | depth: 100→100 (Δ+3) | composite=40", "logger": "interview-agent", "module": "agent_runtime", "line": 1638, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,191", "level": "INFO", "message": "[DECISION] turn=20 | action=PROBE | mode=ownership | next_goal='Find out what was specifically theirs — what they personally' | quality: clarity=1.0 depth=0.0 | overall=0.2", "logger": "interview-agent", "module": "agent_runtime", "line": 1743, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,192", "level": "INFO", "message": "[PROBE] DEEPER ON 'Personal Brand & Marketing Automation St' | mode=ownership | follow_ups=2 | goal=Find out what was specifically theirs — what they personally", "logger": "interview-agent", "module": "agent_runtime", "line": 1758, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,192", "level": "INFO", "message": "[INJECT_FULL] turn=20 action=PROBE | old_directive_existed=True | sys_msgs_after=3 | directive: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] | DECISION: PROBE (OWNERSHIP) | NEXT MOVE: Find out what was specifically theirs — what they personally decided, built, or owned — not the team's. | STYLE: Anchor to", "logger": "interview-agent", "module": "agent_runtime", "line": 1830, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,192", "level": "INFO", "message": "[ROUTER] action=PROBE mode=ownership turn=20 topic=Personal Brand & Marketing Automation St (worker)", "logger": "interview-agent", "module": "agent_runtime", "line": 1859, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,193", "level": "INFO", "message": "[LLM_GATE] directive_ready SET (turn=20 action=PROBE)", "logger": "interview-agent", "module": "agent_runtime", "line": 1869, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,193", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=21 to eval_worker | answer=\"I didn't solve anything.\" | question='No worries at all. Let’s try one last thing—tell me about a ' | active_topic='Personal Brand & Marketing Automation Strategist' | topic_state_score=1.6", "logger": "interview-agent", "module": "agent_runtime", "line": 2123, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,228", "level": "INFO", "message": "[TRANSCRIPT] Partial save 38 lines, 505s duration, 17 turn(s) for app app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-3585", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,230", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-3569", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,231", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 280, "taskName": "Task-3569", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,231", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 288, "taskName": "Task-3569", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,311", "level": "INFO", "message": "[SCORE] Saved 13 question-by-question analysis rows for app-vamsi-resume-gtm-cmpr67k-9159", "logger": "interview-agent", "module": "agent_persistence", "line": 961, "taskName": "Task-3587", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,367", "level": "INFO", "message": "[PERSIST] Answer scores saved after turn=20 (13 records)", "logger": "interview-agent", "module": "agent_runtime", "line": 1662, "taskName": "Task-3587", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:44,488", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=21 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "Task-3584", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:45,946", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I appreciate your honesty, Vamsi. Sometimes just facing a challenge is a learning moment in itself. Before we wrap up, do you have any questions for me about the role or the team?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3580", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:45,947", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 337, "taskName": "Task-3580", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:46,356", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2421, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:51,977", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=dcb7c57db4bf model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 380, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:51,984", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=dcb7c57db4bf model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 507, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:52,029", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=dcb7c57db4bf close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 555, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:59,041", "level": "DEBUG", "message": "Transcript: Interviewer[520]: I appreciate your honesty, Vamsi. Sometimes just facing a challenge is a learning moment in itself. Before we wrap up, do you have any questions for me about the role or the team?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:59,042", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=21 last_q='Before we wrap up, do you have any questions for me about th'", "logger": "interview-agent", "module": "agent_runtime", "line": 2193, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:59,042", "level": "INFO", "message": "✅ TURN 22 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2242, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:59,044", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2419, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:44:59,045", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2441, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
    22:45:04.830 DEBUG    livekit.agents     stream closed
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmpr67k-9159", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159", "app_id": "app-vamsi-resume-gtm-cmpr67k-9159",
"room_name": "interview_app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpr67k-9159", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpr67k-9159", "org_id": "org-vamsi-2336", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM Engineer (Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 22:45:04,847", "level": "INFO", "message": "Candidate participant disconnected", "logger": "interview-agent", "module": "agent_runtime", "line": 1094, "taskName": "Task-33", "session_id": "app-vamsi-resume-gtm-cmpr67k-9159"}
{"timestamp": "2026-05-29 22:45:09,205", "level": "INFO", "message": "[NUDGE] Soft nudge #1 sent at 10s silence", "logg



Worker:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python -m interview.eval_worker
22:35:57 [INFO] eval_worker: [WORKER] Started — redis=redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768 queue=interview:eval_queue
22:37:18 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:18 [INFO] eval_worker: ✅ TURN 3 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:37:18 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:18 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=10 covered=0)
22:37:18 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH | threshold=6.5 base_credit=0.8 turn=3
22:37:18 [INFO] eval_worker: [TURN] INTERVIEW | turn=3 | active=? | covered=none | remaining=1140s | mode=normal | saturation=0% (0.0/6.5)
22:37:18 [INFO] eval_worker: [QA] turn=3  Q: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM Engineer (Fresher) role. How are you doing? Hope the day's been good to you.
              A: So, actually, there is a lot of we can do there, but, like, connecting all the APIs together, let's take an example, Meta API Meta API, Gmail API.
22:37:18 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-29 22:37:19,755", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=28 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-3"}
22:37:20 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:37:22 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:37:22,642", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=4 depth=2 specificity=3 grounding=3 | reason=connecting all the APIs together, let's take an example", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-3"}
22:37:22 [INFO] eval_worker: [QUALITY] turn=3 | clarity=4.0 depth=2.0 specificity=3.0 grounding=3.0 | avg=3.00 weighted=2.85 depth_signal=SURFACE
22:37:22 [INFO] eval_worker: [EVAL] turn=3 action=PROBE mode=evidence quality_avg=3.00 signals=[example_given]
22:37:22 [INFO] eval_worker: [SIGNAL] name=example_given                layer=behavioral_confidence confidence=0.80 delta=+0.04 turn=3
22:37:22 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.85 contribution=0.00 signal_modifier=+0.30 final_contribution=0.30
22:37:22 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.0 → 1.1 (delta=+1.1) | follow_ups: 0 → 1
22:37:22 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.1 < threshold=6.5 (17% done) | need 5.4 more | importance=HIGH
22:37:22 [INFO] eval_worker: [SATURATION] turn=3 | topic=Multi Channel Lead Qualification System | score_1.1_need_5.4 | signals=[example_given]
22:37:22 [INFO] eval_worker: [DECISION] turn=3 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:37:22 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=1.1/6.5 (17%) turn=3
22:37:22 [INFO] eval_worker: [PROBE] family=evidence rotation_index=0 signals=[example_given] | goal: They claimed a skill or capability but gave zero real instance of actually using
22:37:22 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=3 | action=PROBE(evidence) | signals=[example_given] | EXPECTED_BEHAVIOR: agent asks 'They claimed a skill or capability but gave zero real instance of actually using' | saturation=17%
22:37:22 [INFO] eval_worker: [PROBE] Rotation held at index=0 (signal fired) turn=3
22:37:22 [INFO] eval_worker: [RESULT] turn=3  action=PROBE     quality=3.00/SURFACE  signals=[example_given]  saturation=1.1/6.5  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
22:37:22 [INFO] eval_worker: [E2E_VERIFY] turn=3 | PIPELINE_OUTPUT:
  signals_fired    : ['example_given']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (evidence)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (EVIDENCE) ↵ NEXT MOVE: They claimed a skill or capability but gave zero real instance of actua
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
22:37:22 [INFO] eval_worker: [WORKER] ✓ turn=3 action=PROBE | scores: clarity=4.0 depth=2.0 fluency=5.0 confidence=4.0 | overall=3.00 | risk: integrity+0 depth+3
22:37:22 [INFO] eval_worker: [TOPIC_STATE] turn=3 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 1.1/6.5 (17% done, 5.4 remaining) | follow_ups=1 (opened_turn=0) | probe_mode=0 | signals=[example_given]
22:37:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:22 [INFO] eval_worker: ✅ TURN 3 DONE | action=PROBE
22:37:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:38 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:38 [INFO] eval_worker: ✅ TURN 4 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:37:38 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:38 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=1.1/6.5 follow_ups=1 base_credit=0.8
22:37:38 [INFO] eval_worker: [TURN] INTERVIEW | turn=4 | active=Multi Channel Lead Qualification System | covered=none | remaining=1120s | mode=normal | saturation=17% (1.1/6.5)
22:37:38 [INFO] eval_worker: [QA] turn=4  Q: Got it, working with multiple APIs can definitely be tricky. Can you walk me through one specific challenge you faced with those API connections and how you handled it?
              A: sort of Usually, I faced a lot of
22:37:38 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:37:38,901", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=8 follow_ups=1", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-5"}
22:37:39 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:37:41 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:37:41,081", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=ownership depth_signal=SURFACE | clarity=2 depth=1 specificity=1 grounding=1 | reason=\"sort of Usually, I faced a lot of\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-5"}
22:37:41 [INFO] eval_worker: [QUALITY] turn=4 | clarity=2.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.25 weighted=1.20 depth_signal=SURFACE
22:37:41 [INFO] eval_worker: [EVAL] turn=4 action=PROBE mode=process quality_avg=1.25 signals=[example_evasion, latency_mismatch]
22:37:41 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.78 delta=-0.15 turn=4
22:37:41 [INFO] eval_worker: [SIGNAL] name=latency_mismatch             layer=behavioral_confidence confidence=0.77 delta=-0.10 turn=4
22:37:41 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.20 contribution=0.00 signal_modifier=-2.50 final_contribution=0.00
22:37:41 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 1.1 → 1.9 (delta=+0.8) | follow_ups: 1 → 2
22:37:41 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.9 < threshold=6.5 (29% done) | need 4.6 more | importance=HIGH
22:37:41 [INFO] eval_worker: [SATURATION] turn=4 | topic=Multi Channel Lead Qualification System | score_1.9_need_4.6 | signals=[example_evasion, latency_mismatch]
22:37:41 [INFO] eval_worker: [DECISION] turn=4 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:37:41 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=1.9/6.5 (29%) turn=4
22:37:41 [INFO] eval_worker: [PROBE] family=process rotation_index=0 signals=[example_evasion, latency_mismatch] | goal: Understand HOW they actually built or did the work — get into the specifics of t
22:37:41 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=4 | action=PROBE(process) | signals=[example_evasion, latency_mismatch] | EXPECTED_BEHAVIOR: agent asks 'Understand HOW they actually built or did the work — get into the specifics of t' | saturation=29%
22:37:41 [INFO] eval_worker: [PROBE] Rotation held at index=0 (signal fired) turn=4
22:37:41 [INFO] eval_worker: [RESULT] turn=4  action=PROBE     quality=1.25/SURFACE  signals=[example_evasion, latency_mismatch]  saturation=1.9/6.5  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
22:37:41 [INFO] eval_worker: [E2E_VERIFY] turn=4 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion', 'latency_mismatch']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (process)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (PROCESS) ↵ NEXT MOVE: Understand HOW they actually built or did the work — get into the specif
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:37:41 [INFO] eval_worker: [WORKER] ✓ turn=4 action=PROBE | scores: clarity=2.0 depth=1.0 fluency=2.0 confidence=2.0 | overall=1.25 | risk: integrity+0 depth+28
22:37:41 [INFO] eval_worker: [TOPIC_STATE] turn=4 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 1.9/6.5 (29% done, 4.6 remaining) | follow_ups=2 (opened_turn=0) | probe_mode=0 | signals=[example_evasion, latency_mismatch]
22:37:41 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:37:41 [INFO] eval_worker: ✅ TURN 4 DONE | action=PROBE
22:37:41 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:00 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:00 [INFO] eval_worker: ✅ TURN 5 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:38:00 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:00 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=1.9/6.5 follow_ups=2 base_credit=0.8
22:38:00 [INFO] eval_worker: [TURN] INTERVIEW | turn=5 | active=Multi Channel Lead Qualification System | covered=none | remaining=1099s | mode=normal | saturation=29% (1.9/6.5)
22:38:00 [INFO] eval_worker: [QA] turn=5  Q: Take your time — what kind of issues were you running into with the API connections?
              A: yeah. So, basically, what I was doing I was doing meta API errors. So there are a lot of errors in meta API. Like, we need to get a lot of things like
22:38:00 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:38:00,297", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=33 follow_ups=2", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-7"}
22:38:00 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:38:02 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:38:02,151", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=3 depth=2 specificity=2 grounding=2 | reason=what I was doing I was doing meta API errors", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-7"}
22:38:02 [INFO] eval_worker: [QUALITY] turn=5 | clarity=3.0 depth=2.0 specificity=2.0 grounding=2.0 | avg=2.25 weighted=2.20 depth_signal=SURFACE
22:38:02 [INFO] eval_worker: [EVAL] turn=5 action=PROBE mode=evidence quality_avg=2.25 signals=[example_given]
22:38:02 [INFO] eval_worker: [SIGNAL] name=example_given                layer=behavioral_confidence confidence=0.80 delta=+0.04 turn=5
22:38:02 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.20 contribution=0.00 signal_modifier=+0.30 final_contribution=0.30
22:38:02 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 1.9 → 3.0 (delta=+1.1) | follow_ups: 2 → 3
22:38:02 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=3.0 < threshold=6.5 (46% done) | need 3.5 more | importance=HIGH
22:38:02 [INFO] eval_worker: [SATURATION] turn=5 | topic=Multi Channel Lead Qualification System | score_3.0_need_3.5 | signals=[example_given]
22:38:02 [INFO] eval_worker: [DECISION] turn=5 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:38:02 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=3.0/6.5 (46%) turn=5
22:38:02 [INFO] eval_worker: [PROBE] family=evidence rotation_index=0 signals=[example_given] | goal: They claimed a skill or capability but gave zero real instance of actually using
22:38:02 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=5 | action=PROBE(evidence) | signals=[example_given] | EXPECTED_BEHAVIOR: agent asks 'They claimed a skill or capability but gave zero real instance of actually using' | saturation=46%
22:38:02 [INFO] eval_worker: [PROBE] Rotation held at index=0 (signal fired) turn=5
22:38:02 [INFO] eval_worker: [RESULT] turn=5  action=PROBE     quality=2.25/SURFACE  signals=[example_given]  saturation=3.0/6.5  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
22:38:02 [INFO] eval_worker: [E2E_VERIFY] turn=5 | PIPELINE_OUTPUT:
  signals_fired    : ['example_given']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (evidence)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (EVIDENCE) ↵ NEXT MOVE: They claimed a skill or capability but gave zero real instance of actua
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:38:02 [INFO] eval_worker: [WORKER] ✓ turn=5 action=PROBE | scores: clarity=3.0 depth=2.0 fluency=4.0 confidence=4.0 | overall=2.25 | risk: integrity+0 depth+3
22:38:02 [INFO] eval_worker: [TOPIC_STATE] turn=5 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 3.0/6.5 (46% done, 3.5 remaining) | follow_ups=3 (opened_turn=0) | probe_mode=0 | signals=[example_given]
22:38:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:02 [INFO] eval_worker: ✅ TURN 5 DONE | action=PROBE
22:38:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:23 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:23 [INFO] eval_worker: ✅ TURN 6 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:38:23 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:23 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=3.0/6.5 follow_ups=3 base_credit=0.8
22:38:23 [INFO] eval_worker: [TURN] INTERVIEW | turn=6 | active=Multi Channel Lead Qualification System | covered=none | remaining=1075s | mode=normal | saturation=46% (3.0/6.5)
22:38:23 [INFO] eval_worker: [QA] turn=6  Q: I lost you a little—when you say "money," what does that look like in the context of the Meta API errors you were facing?
              A: Not money. I misspelled this word.
22:38:23 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:38:23,436", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=6 follow_ups=3", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-9"}
22:38:24 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:38:25 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:38:25,373", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=verification depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason=\"Not money. I misspelled this word.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-9"}
22:38:25 [INFO] eval_worker: [QUALITY] turn=6 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
22:38:25 [INFO] eval_worker: [EVAL] turn=6 action=PROBE mode=verification quality_avg=1.50 signals=[none]
22:38:25 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:38:25 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 3.0 → 3.8 (delta=+0.8) | follow_ups: 3 → 4
22:38:25 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=3.8 < threshold=6.5 (58% done) | need 2.7 more | importance=HIGH
22:38:25 [INFO] eval_worker: [SATURATION] turn=6 | topic=Multi Channel Lead Qualification System | score_3.8_need_2.7 | signals=[none]
22:38:25 [INFO] eval_worker: [DECISION] turn=6 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:38:25 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=3.8/6.5 (58%) turn=6
22:38:25 [INFO] eval_worker: [PROBE] family=verification rotation_index=0 signals=[none] | goal: The answer sounds rehearsed — probe real memory of the exact moment, not the sum
22:38:25 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=6 | action=PROBE(verification) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'The answer sounds rehearsed — probe real memory of the exact moment, not the sum' | saturation=58%
22:38:25 [INFO] eval_worker: [PROBE] Rotation advanced: 0 → 1 (no signal) turn=6
22:38:25 [INFO] eval_worker: [RESULT] turn=6  action=PROBE     quality=1.50/SURFACE  signals=[none]  saturation=3.8/6.5  probe_index=1
         next=Multi Channel Lead Qualification System             covered=none
22:38:25 [INFO] eval_worker: [E2E_VERIFY] turn=6 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (verification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (VERIFICATION) ↵ NEXT MOVE: The answer sounds rehearsed — probe real memory of the exact moment
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:38:25 [INFO] eval_worker: [WORKER] ✓ turn=6 action=PROBE | scores: clarity=3.0 depth=1.0 fluency=6.0 confidence=7.0 | overall=1.50 | risk: integrity+0 depth+3
22:38:25 [INFO] eval_worker: [TOPIC_STATE] turn=6 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 3.8/6.5 (58% done, 2.7 remaining) | follow_ups=4 (opened_turn=0) | probe_mode=1
22:38:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:25 [INFO] eval_worker: ✅ TURN 6 DONE | action=PROBE
22:38:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:49 [INFO] eval_worker: ✅ TURN 7 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:38:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:49 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=3.8/6.5 follow_ups=4 base_credit=0.8
22:38:49 [INFO] eval_worker: [TURN] INTERVIEW | turn=7 | active=Multi Channel Lead Qualification System | covered=none | remaining=1049s | mode=normal | saturation=58% (3.8/6.5)
22:38:49 [INFO] eval_worker: [QA] turn=7  Q: Ah, got it — approvals from Meta’s side for API access. That sounds like it could slow things down. How did you manage or work around those approval hurdles while building the system?
              A: Mostly, I use it to
22:38:49 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:38:49,800", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=5 follow_ups=4", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-11"}
22:38:51 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:38:52,002", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=verification depth_signal=SURFACE | clarity=1 depth=0 specificity=0 grounding=0 | reason=\"Mostly, I use it to\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-11"}
22:38:52 [INFO] eval_worker: [QUALITY] turn=7 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
22:38:52 [INFO] eval_worker: [EVAL] turn=7 action=PROBE mode=verification quality_avg=0.25 signals=[none]
22:38:52 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:38:52 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 3.8 → 4.6 (delta=+0.8) | follow_ups: 4 → 5
22:38:52 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=4.6 < threshold=6.5 (71% done) | need 1.9 more | importance=HIGH
22:38:52 [INFO] eval_worker: [SATURATION] turn=7 | topic=Multi Channel Lead Qualification System | score_4.6_need_1.9 | signals=[none]
22:38:52 [INFO] eval_worker: [DECISION] turn=7 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:38:52 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=4.6/6.5 (71%) turn=7
22:38:52 [INFO] eval_worker: [PROBE] family=verification rotation_index=1 signals=[none] | goal: The answer sounds rehearsed — probe real memory of the exact moment, not the sum
22:38:52 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=7 | action=PROBE(verification) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'The answer sounds rehearsed — probe real memory of the exact moment, not the sum' | saturation=71%
22:38:52 [INFO] eval_worker: [PROBE] Rotation advanced: 1 → 2 (no signal) turn=7
22:38:52 [INFO] eval_worker: [RESULT] turn=7  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=4.6/6.5  probe_index=2
         next=Multi Channel Lead Qualification System             covered=none
22:38:52 [INFO] eval_worker: [E2E_VERIFY] turn=7 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (verification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (VERIFICATION) ↵ NEXT MOVE: The answer sounds rehearsed — probe real memory of the exact moment
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:38:52 [INFO] eval_worker: [WORKER] ✓ turn=7 action=PROBE | scores: clarity=1.0 depth=0.0 fluency=1.0 confidence=1.0 | overall=0.25 | risk: integrity+0 depth+3
22:38:52 [INFO] eval_worker: [TOPIC_STATE] turn=7 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 4.6/6.5 (71% done, 1.9 remaining) | follow_ups=5 (opened_turn=0) | probe_mode=2
22:38:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:38:52 [INFO] eval_worker: ✅ TURN 7 DONE | action=PROBE
22:38:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:12 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:12 [INFO] eval_worker: ✅ TURN 8 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:39:12 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:12 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=4.6/6.5 follow_ups=5 base_credit=0.8
22:39:12 [INFO] eval_worker: [TURN] INTERVIEW | turn=8 | active=Multi Channel Lead Qualification System | covered=none | remaining=1026s | mode=normal | saturation=71% (4.6/6.5)
22:39:12 [INFO] eval_worker: [QA] turn=8  Q: Okay, that makes sense — you learned by researching and experimenting before actually building. Can you give me a specific example of a time when you hit a roadblock during development and how you fig
              A: To be honest, main thing is to work
22:39:12 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:39:12,909", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=8 follow_ups=5", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-13"}
22:39:13 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:39:15 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:39:15,126", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=process depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason=\"main thing is to work\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-13"}
22:39:15 [INFO] eval_worker: [QUALITY] turn=8 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
22:39:15 [INFO] eval_worker: [EVAL] turn=8 action=PROBE mode=process quality_avg=1.50 signals=[example_evasion, latency_mismatch]
22:39:15 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=8
22:39:15 [INFO] eval_worker: [SIGNAL] name=latency_mismatch             layer=behavioral_confidence confidence=0.77 delta=-0.10 turn=8
22:39:15 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=-2.50 final_contribution=0.00
22:39:15 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 4.6 → 5.4 (delta=+0.8) | follow_ups: 5 → 6
22:39:15 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=5.4 < threshold=6.5 (83% done) | need 1.1 more | importance=HIGH
22:39:15 [INFO] eval_worker: [SATURATION] turn=8 | topic=Multi Channel Lead Qualification System | score_5.4_need_1.1 | signals=[example_evasion, latency_mismatch]
22:39:15 [INFO] eval_worker: [DECISION] turn=8 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:39:15 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=5.4/6.5 (83%) turn=8
22:39:15 [INFO] eval_worker: [PROBE] family=process rotation_index=2 signals=[example_evasion, latency_mismatch] | goal: Understand HOW they actually built or did the work — get into the specifics of t
22:39:15 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=8 | action=PROBE(process) | signals=[example_evasion, latency_mismatch] | EXPECTED_BEHAVIOR: agent asks 'Understand HOW they actually built or did the work — get into the specifics of t' | saturation=83%
22:39:15 [INFO] eval_worker: [PROBE] Rotation held at index=2 (signal fired) turn=8
22:39:15 [INFO] eval_worker: [RESULT] turn=8  action=PROBE     quality=1.50/SURFACE  signals=[example_evasion, latency_mismatch]  saturation=5.4/6.5  probe_index=2
         next=Multi Channel Lead Qualification System             covered=none
22:39:15 [INFO] eval_worker: [E2E_VERIFY] turn=8 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion', 'latency_mismatch']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (process)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (PROCESS) ↵ NEXT MOVE: Understand HOW they actually built or did the work — get into the specif
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:39:15 [INFO] eval_worker: [WORKER] ✓ turn=8 action=PROBE | scores: clarity=3.0 depth=1.0 fluency=5.0 confidence=4.0 | overall=1.50 | risk: integrity+0 depth+28
22:39:15 [INFO] eval_worker: [TOPIC_STATE] turn=8 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 5.4/6.5 (83% done, 1.1 remaining) | follow_ups=6 (opened_turn=0) | probe_mode=2 | signals=[example_evasion, latency_mismatch]
22:39:15 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:15 [INFO] eval_worker: ✅ TURN 8 DONE | action=PROBE
22:39:15 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:40 [INFO] eval_worker: ✅ TURN 9 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:39:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:40 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=5.4/6.5 follow_ups=6 base_credit=0.8
22:39:40 [INFO] eval_worker: [TURN] INTERVIEW | turn=9 | active=Multi Channel Lead Qualification System | covered=none | remaining=999s | mode=normal | saturation=83% (5.4/6.5)
22:39:40 [INFO] eval_worker: [QA] turn=9  Q: Thanks for being straight with me. When you say your main thing is to work, can you tell me what part of the project you found yourself focusing on the most?
              A: So, like, I mean, I would like to go with hallucination part. Hallucination is something that a gives a lot of unusual replies. So based on the training I did, a gave better replies compared to
22:39:40 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:39:40,304", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=36 follow_ups=6", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-15"}
22:39:40 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:39:42 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:39:42,383", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=ownership depth_signal=SURFACE | clarity=4 depth=2 specificity=2 grounding=2 | reason=I would like to go with hallucination part", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-15"}
22:39:42 [INFO] eval_worker: [QUALITY] turn=9 | clarity=4.0 depth=2.0 specificity=2.0 grounding=2.0 | avg=2.50 weighted=2.40 depth_signal=SURFACE
22:39:42 [INFO] eval_worker: [EVAL] turn=9 action=PROBE mode=ownership quality_avg=2.50 signals=[none]
22:39:42 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:39:42 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 5.4 → 6.2 (delta=+0.8) | follow_ups: 6 → 7
22:39:42 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=6.2 < threshold=6.5 (95% done) | need 0.3 more | importance=HIGH
22:39:42 [INFO] eval_worker: [SATURATION] turn=9 | topic=Multi Channel Lead Qualification System | score_6.2_need_0.3 | signals=[none]
22:39:42 [INFO] eval_worker: [DECISION] turn=9 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:39:42 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=6.2/6.5 (95%) turn=9
22:39:42 [INFO] eval_worker: [PROBE] family=ownership rotation_index=2 signals=[none] | goal: Find out what was specifically theirs — what they personally decided, built, or
22:39:42 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=9 | action=PROBE(ownership) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'Find out what was specifically theirs — what they personally decided, built, or ' | saturation=95%
22:39:42 [INFO] eval_worker: [PROBE] Rotation advanced: 2 → 3 (no signal) turn=9
22:39:42 [INFO] eval_worker: [RESULT] turn=9  action=PROBE     quality=2.50/SURFACE  signals=[none]  saturation=6.2/6.5  probe_index=3
         next=Multi Channel Lead Qualification System             covered=none
22:39:42 [INFO] eval_worker: [E2E_VERIFY] turn=9 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ NEXT MOVE: Find out what was specifically theirs — what they personally decided,
  topic_after      : Multi Channel Lead Qualification System (was: Multi Channel Lead Qualification System)
  covered_topics   : 0 total
22:39:42 [INFO] eval_worker: [WORKER] ✓ turn=9 action=PROBE | scores: clarity=4.0 depth=2.0 fluency=4.0 confidence=4.0 | overall=2.50 | risk: integrity+0 depth+3
22:39:42 [INFO] eval_worker: [TOPIC_STATE] turn=9 | topic='Multi Channel Lead Qualification System' | importance=HIGH | saturated=False | progress: 6.2/6.5 (95% done, 0.3 remaining) | follow_ups=7 (opened_turn=0) | probe_mode=3
22:39:42 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:39:42 [INFO] eval_worker: ✅ TURN 9 DONE | action=PROBE
22:39:42 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:40:04 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:40:04 [INFO] eval_worker: ✅ TURN 10 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:40:04 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:40:04 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=6.2/6.5 follow_ups=7 base_credit=0.8
22:40:04 [INFO] eval_worker: [TURN] INTERVIEW | turn=10 | active=Multi Channel Lead Qualification System | covered=none | remaining=975s | mode=normal | saturation=95% (6.2/6.5)
22:40:04 [INFO] eval_worker: [QA] turn=10  Q: That's actually a smart call—focusing on AI responses to reduce hallucination is key. How did you measure or test that your AI was giving better, more accurate replies?
              A: before what client was using. Sure. It might be, like, I use it to train a lot of I use it to test a lot.
22:40:04 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:40:04,207", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=25 follow_ups=7", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-17"}
22:40:04 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:40:08,225", "level": "WARNING", "message": "[EVAL] Merged evaluator timed out turn — returning low scores + PROBE fallback", "logger": "interview-agent", "module": "agent_scoring", "line": 225, "taskName": "Task-17"}
22:40:08 [INFO] eval_worker: [QUALITY] turn=10 | clarity=1.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.00 weighted=1.00 depth_signal=SURFACE
22:40:08 [INFO] eval_worker: [EVAL] turn=10 action=MOVE_ON mode=normal quality_avg=1.00 signals=[depth_decay, example_given]
22:40:08 [INFO] eval_worker: [SIGNAL] name=depth_decay                  layer=intelligence_quality confidence=0.59 delta=-0.06 turn=10
22:40:08 [INFO] eval_worker: [SIGNAL] name=example_given                layer=behavioral_confidence confidence=0.80 delta=+0.04 turn=10
22:40:08 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.00 contribution=0.00 signal_modifier=+0.30 final_contribution=0.30
22:40:08 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 6.2 → 7.3 (delta=+1.1) | follow_ups: 7 → 8
22:40:08 [INFO] eval_worker: [SAT_RESULT] ✅ SATURATED | score=7.3 >= threshold=6.5 (100%) | importance=HIGH
22:40:08 [INFO] eval_worker: [SATURATION] turn=10 | topic=Multi Channel Lead Qualification System | saturated_at_7.3 | signals=[depth_decay, example_given] | depth_decay→MOVE_ON
22:40:08 [INFO] eval_worker: [DECISION] turn=10 | depth_decay=True weak_exit=False saturated=True action=MOVE_ON
22:40:08 [INFO] eval_worker: [DECISION] ✅ DEPTH_DECAY fired → forcing MOVE_ON turn=10
22:40:08 [INFO] eval_worker: [SATURATION] MOVE_ON reason=depth_decay → next=Sensex Analysis Project (importance=HIGH) turn=10
22:40:08 [INFO] eval_worker: [RESULT] turn=10  action=MOVE_ON   quality=1.00/SURFACE  signals=[depth_decay, example_given]  saturation=7.3/6.5  probe_index=3
         next=Sensex Analysis Project                             covered=['multi channel lead qualification system']
22:40:08 [INFO] eval_worker: [E2E_VERIFY] turn=10 | PIPELINE_OUTPUT:
  signals_fired    : ['depth_decay', 'example_given']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Sensex Analysis Project'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Sensex Analysis Project ↵ YOUR ONLY JOB THIS TURN: Acknowledge briefly and
  topic_after      : Sensex Analysis Project (was: Multi Channel Lead Qualification System)
  covered_topics   : 1 total
22:40:08 [INFO] eval_worker: [WORKER] ✓ turn=10 action=MOVE_ON | scores: clarity=1.0 depth=1.0 fluency=1.0 confidence=1.0 | overall=1.00 | risk: integrity+0 depth+9
22:40:08 [INFO] eval_worker: [TOPIC_STATE] turn=10 | topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0 | signals=[depth_decay, example_given]
22:40:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:40:08 [INFO] eval_worker: ✅ TURN 10 DONE | action=MOVE_ON
22:40:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:41:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:41:08 [INFO] eval_worker: ✅ TURN 12 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:41:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:41:08 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=6.2/6.5 follow_ups=7 base_credit=0.8
22:41:08 [INFO] eval_worker: [TURN] INTERVIEW | turn=12 | active=Multi Channel Lead Qualification System | covered=none | remaining=910s | mode=normal | saturation=95% (6.2/6.5)
22:41:08 [INFO] eval_worker: [QA] turn=12  Q: Got it, so you used real past conversations to train and test the AI's responses. Can you describe a specific test or example where the AI’s improved reply made a clear difference for the client? Okay
              A: No. Sorry. I'm not sure. They're working on the no rush at all.
22:41:08 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:41:08,912", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=13 follow_ups=7", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-19"}
22:41:09 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:41:11 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:41:11,661", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=2 depth=1 specificity=0 grounding=0 | reason=\"No. Sorry. I'm not sure. They're working on\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-19"}
22:41:11 [INFO] eval_worker: [QUALITY] turn=12 | clarity=2.0 depth=1.0 specificity=0.0 grounding=0.0 | avg=0.75 weighted=0.75 depth_signal=SURFACE
22:41:11 [INFO] eval_worker: [EVAL] turn=12 action=PROBE mode=compression quality_avg=0.75 signals=[latency_mismatch]
22:41:11 [INFO] eval_worker: [SIGNAL] name=latency_mismatch             layer=behavioral_confidence confidence=0.77 delta=-0.10 turn=12
22:41:11 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.75 contribution=0.00 signal_modifier=-1.00 final_contribution=0.00
22:41:11 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 6.2 → 7.0 (delta=+0.8) | follow_ups: 7 → 8
22:41:11 [INFO] eval_worker: [SAT_RESULT] ✅ SATURATED | score=7.0 >= threshold=6.5 (100%) | importance=HIGH
22:41:11 [INFO] eval_worker: [SATURATION] turn=12 | topic=Multi Channel Lead Qualification System | saturated_at_7.0 | signals=[latency_mismatch]
22:41:11 [INFO] eval_worker: [DECISION] turn=12 | depth_decay=False weak_exit=False saturated=True action=PROBE
22:41:11 [INFO] eval_worker: [DECISION] ✅ SATURATED → score=7.0 >= threshold=6.5 → forcing MOVE_ON turn=12
22:41:11 [INFO] eval_worker: [SATURATION] MOVE_ON reason=saturated(saturated_at_7.0) → next=Sensex Analysis Project (importance=HIGH) turn=12
22:41:11 [INFO] eval_worker: [RESULT] turn=12  action=MOVE_ON   quality=0.75/SURFACE  signals=[latency_mismatch]  saturation=7.0/6.5  probe_index=3
         next=Sensex Analysis Project                             covered=['multi channel lead qualification system']
22:41:11 [INFO] eval_worker: [E2E_VERIFY] turn=12 | PIPELINE_OUTPUT:
  signals_fired    : ['latency_mismatch']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Sensex Analysis Project'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Sensex Analysis Project ↵ YOUR ONLY JOB THIS TURN: Acknowledge briefly and
  topic_after      : Sensex Analysis Project (was: Multi Channel Lead Qualification System)
  covered_topics   : 1 total
22:41:11 [INFO] eval_worker: [WORKER] ✓ turn=12 action=MOVE_ON | scores: clarity=2.0 depth=1.0 fluency=3.0 confidence=1.0 | overall=0.75 | risk: integrity+0 depth+13
22:41:11 [INFO] eval_worker: [TOPIC_STATE] turn=12 | topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0 | signals=[latency_mismatch]
22:41:11 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:41:11 [INFO] eval_worker: ✅ TURN 12 DONE | action=MOVE_ON
22:41:11 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:21 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:21 [INFO] eval_worker: ✅ TURN 14 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:42:21 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:21 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Multi Channel Lead Qualification System importance=HIGH | saturation_score=6.2/6.5 follow_ups=7 base_credit=0.8
22:42:21 [INFO] eval_worker: [TURN] INTERVIEW | turn=14 | active=Multi Channel Lead Qualification System | covered=none | remaining=837s | mode=normal | saturation=95% (6.2/6.5)
22:42:21 [INFO] eval_worker: [QA] turn=14  Q: Thanks for being honest, I appreciate that. Let’s try a different angle—when you worked on cleaning and analyzing the Sensex data, what tools or methods did you find most helpful to handle messy or la
              A: I don't know really. I am not sure.
22:42:21 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Sensex Analysis Project | discussed_log=0 entries
{"timestamp": "2026-05-29 22:42:22,002", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=8 follow_ups=7", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-21"}
22:42:22 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:42:24 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:42:24,067", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=2 depth=0 specificity=0 grounding=0 | reason=\"I don't know really. I am not sure.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-21"}
22:42:24 [INFO] eval_worker: [QUALITY] turn=14 | clarity=2.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.50 weighted=0.40 depth_signal=SURFACE
22:42:24 [INFO] eval_worker: [EVAL] turn=14 action=PROBE mode=evidence quality_avg=0.50 signals=[none]
22:42:24 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:42:24 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 6.2 → 7.0 (delta=+0.8) | follow_ups: 7 → 8
22:42:24 [INFO] eval_worker: [SAT_RESULT] ✅ SATURATED | score=7.0 >= threshold=6.5 (100%) | importance=HIGH
22:42:24 [INFO] eval_worker: [SATURATION] turn=14 | topic=Multi Channel Lead Qualification System | saturated_at_7.0 | signals=[none]
22:42:24 [INFO] eval_worker: [DECISION] turn=14 | depth_decay=False weak_exit=False saturated=True action=PROBE
22:42:24 [INFO] eval_worker: [DECISION] ✅ SATURATED → score=7.0 >= threshold=6.5 → forcing MOVE_ON turn=14
22:42:24 [INFO] eval_worker: [SATURATION] MOVE_ON reason=saturated(saturated_at_7.0) → next=Sensex Analysis Project (importance=HIGH) turn=14
22:42:24 [INFO] eval_worker: [RESULT] turn=14  action=MOVE_ON   quality=0.50/SURFACE  signals=[none]  saturation=7.0/6.5  probe_index=3
         next=Sensex Analysis Project                             covered=['multi channel lead qualification system']
22:42:24 [INFO] eval_worker: [E2E_VERIFY] turn=14 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Sensex Analysis Project'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Sensex Analysis Project ↵ YOUR ONLY JOB THIS TURN: Acknowledge briefly and
  topic_after      : Sensex Analysis Project (was: Multi Channel Lead Qualification System)
  covered_topics   : 1 total
22:42:24 [INFO] eval_worker: [WORKER] ✓ turn=14 action=MOVE_ON | scores: clarity=2.0 depth=0.0 fluency=5.0 confidence=1.0 | overall=0.50 | risk: integrity+0 depth+3
22:42:24 [INFO] eval_worker: [TOPIC_STATE] turn=14 | topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0
22:42:24 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:24 [INFO] eval_worker: ✅ TURN 14 DONE | action=MOVE_ON
22:42:24 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:37 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:37 [INFO] eval_worker: ✅ TURN 15 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:42:37 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:37 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Sensex Analysis Project importance=HIGH | saturation_score=0.0/6.5 follow_ups=0 base_credit=0.8
22:42:37 [INFO] eval_worker: [TURN] INTERVIEW | turn=15 | active=Sensex Analysis Project | covered=['multi channel lead qualification system'] | remaining=822s | mode=normal | saturation=0% (0.0/6.5)
22:42:37 [INFO] eval_worker: [QA] turn=15  Q: That’s okay. Let’s talk about a different project then — the Campaign Metrics and Slack Reporting System you built. Can you share how you set up the automation to send live campaign data into Slack?
              A: Slack reporting system. Can you share how to spend that automation system
22:42:37 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Campaign Metrics and Slack Reporting System | discussed_log=1 entries
{"timestamp": "2026-05-29 22:42:37,403", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=12 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-23"}
22:42:38 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:42:39 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:42:39,792", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=2 depth=0 specificity=0 grounding=0 | reason=\"Slack reporting system. Can you share how to spend that automation system\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-23"}
22:42:39 [INFO] eval_worker: [QUALITY] turn=15 | clarity=2.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.50 weighted=0.40 depth_signal=SURFACE
22:42:39 [INFO] eval_worker: [EVAL] turn=15 action=PROBE mode=process quality_avg=0.50 signals=[example_evasion]
22:42:39 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=15
22:42:39 [INFO] eval_worker: [SAT_CALC] topic=Sensex Analysis Project | response_score=0.40 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
22:42:39 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.0 → 0.8 (delta=+0.8) | follow_ups: 0 → 1
22:42:39 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=0.8 < threshold=6.5 (12% done) | need 5.7 more | importance=HIGH
22:42:39 [INFO] eval_worker: [SATURATION] turn=15 | topic=Sensex Analysis Project | score_0.8_need_5.7 | signals=[example_evasion]
22:42:39 [INFO] eval_worker: [DECISION] turn=15 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:42:39 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=0.8/6.5 (12%) turn=15
22:42:39 [INFO] eval_worker: [PROBE] family=process rotation_index=0 signals=[example_evasion] | goal: Understand HOW they actually built or did the work — get into the specifics of t
22:42:39 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=15 | action=PROBE(process) | signals=[example_evasion] | EXPECTED_BEHAVIOR: agent asks 'Understand HOW they actually built or did the work — get into the specifics of t' | saturation=12%
22:42:39 [INFO] eval_worker: [PROBE] Rotation held at index=0 (signal fired) turn=15
22:42:39 [INFO] eval_worker: [RESULT] turn=15  action=PROBE     quality=0.50/SURFACE  signals=[example_evasion]  saturation=0.8/6.5  probe_index=0
         next=Sensex Analysis Project                             covered=['multi channel lead qualification system']
22:42:39 [INFO] eval_worker: [E2E_VERIFY] turn=15 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Sensex Analysis Project' (process)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (PROCESS) ↵ NEXT MOVE: Understand HOW they actually built or did the work — get into the specif
  topic_after      : Sensex Analysis Project (was: Sensex Analysis Project)
  covered_topics   : 1 total
22:42:40 [INFO] eval_worker: [WORKER] ✓ turn=15 action=PROBE | scores: clarity=2.0 depth=0.0 fluency=2.0 confidence=1.0 | overall=0.50 | risk: integrity+0 depth+18
22:42:40 [INFO] eval_worker: [TOPIC_STATE] turn=15 | topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 0.8/6.5 (12% done, 5.7 remaining) | follow_ups=1 (opened_turn=0) | probe_mode=0 | signals=[example_evasion]
22:42:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:40 [INFO] eval_worker: ✅ TURN 15 DONE | action=PROBE
22:42:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:57 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:57 [INFO] eval_worker: ✅ TURN 16 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:42:57 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:57 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Sensex Analysis Project importance=HIGH | saturation_score=0.8/6.5 follow_ups=1 base_credit=0.8
22:42:57 [INFO] eval_worker: [TURN] INTERVIEW | turn=16 | active=Sensex Analysis Project | covered=['multi channel lead qualification system'] | remaining=802s | mode=normal | saturation=12% (0.8/6.5)
22:42:57 [INFO] eval_worker: [QA] turn=16  Q: Sure! What I’m really curious about is how you decided what data to send into Slack and how you made sure it was useful for the teams using it. What was your thought process there?
              A: I don't know. I am very stuck with this project. I don't know.
22:42:57 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Campaign Metrics and Slack Reporting System | discussed_log=1 entries
{"timestamp": "2026-05-29 22:42:57,106", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=13 follow_ups=1", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-25"}
22:42:58 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:42:59 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:42:59,542", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=2 depth=0 specificity=0 grounding=0 | reason=\"I don't know. I am very stuck with this project.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-25"}
22:42:59 [INFO] eval_worker: [QUALITY] turn=16 | clarity=2.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.50 weighted=0.40 depth_signal=SURFACE
22:42:59 [INFO] eval_worker: [EVAL] turn=16 action=PROBE mode=evidence quality_avg=0.50 signals=[none]
22:42:59 [INFO] eval_worker: [SAT_CALC] topic=Sensex Analysis Project | response_score=0.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:42:59 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.8 → 1.6 (delta=+0.8) | follow_ups: 1 → 2
22:42:59 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.6 < threshold=6.5 (25% done) | need 4.9 more | importance=HIGH
22:42:59 [INFO] eval_worker: [SATURATION] turn=16 | topic=Sensex Analysis Project | score_1.6_need_4.9 | signals=[none]
22:42:59 [INFO] eval_worker: [DECISION] turn=16 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:42:59 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=1.6/6.5 (25%) turn=16
22:42:59 [INFO] eval_worker: [PROBE] family=evidence rotation_index=0 signals=[none] | goal: They claimed a skill or capability but gave zero real instance of actually using
22:42:59 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=16 | action=PROBE(evidence) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'They claimed a skill or capability but gave zero real instance of actually using' | saturation=25%
22:42:59 [INFO] eval_worker: [PROBE] Rotation advanced: 0 → 1 (no signal) turn=16
22:42:59 [INFO] eval_worker: [RESULT] turn=16  action=PROBE     quality=0.50/SURFACE  signals=[none]  saturation=1.6/6.5  probe_index=1
         next=Sensex Analysis Project                             covered=['multi channel lead qualification system']
22:42:59 [INFO] eval_worker: [E2E_VERIFY] turn=16 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Sensex Analysis Project' (evidence)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (EVIDENCE) ↵ NEXT MOVE: They claimed a skill or capability but gave zero real instance of actua
  topic_after      : Sensex Analysis Project (was: Sensex Analysis Project)
  covered_topics   : 1 total
22:42:59 [INFO] eval_worker: [WORKER] ✓ turn=16 action=PROBE | scores: clarity=2.0 depth=0.0 fluency=3.0 confidence=1.0 | overall=0.50 | risk: integrity+0 depth+3
22:42:59 [INFO] eval_worker: [TOPIC_STATE] turn=16 | topic='Sensex Analysis Project' | importance=HIGH | saturated=False | progress: 1.6/6.5 (25% done, 4.9 remaining) | follow_ups=2 (opened_turn=0) | probe_mode=1
22:42:59 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:42:59 [INFO] eval_worker: ✅ TURN 16 DONE | action=PROBE
22:42:59 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:26 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:26 [INFO] eval_worker: ✅ TURN 17 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:43:26 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:26 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Sensex Analysis Project importance=HIGH | saturation_score=0.8/6.5 follow_ups=1 base_credit=0.8
22:43:26 [INFO] eval_worker: [TURN] INTERVIEW | turn=17 | active=Sensex Analysis Project | covered=['multi channel lead qualification system'] | remaining=772s | mode=normal | saturation=12% (0.8/6.5)
22:43:26 [INFO] eval_worker: [QA] turn=17  Q: No worries, Vamsi. Let’s back up a bit — think about one small part of that project where you felt you made a clear impact or learned something new. What comes to mind first?
              A: Don't know. I did work on any many projects much.
22:43:26 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Campaign Metrics and Slack Reporting System | discussed_log=1 entries
{"timestamp": "2026-05-29 22:43:26,496", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=10 follow_ups=1", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-27"}
22:43:27 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:43:28 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:43:28,880", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=verification depth_signal=SURFACE | clarity=2 depth=1 specificity=1 grounding=1 | reason=\"Don't know. I did work on any many projects much.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-27"}
22:43:28 [INFO] eval_worker: [QUALITY] turn=17 | clarity=2.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.25 weighted=1.20 depth_signal=SURFACE
22:43:28 [INFO] eval_worker: [EVAL] turn=17 action=MOVE_ON mode=normal quality_avg=1.25 signals=[depth_decay]
22:43:28 [INFO] eval_worker: [SIGNAL] name=depth_decay                  layer=intelligence_quality confidence=0.61 delta=-0.06 turn=17
22:43:28 [INFO] eval_worker: [SAT_CALC] topic=Sensex Analysis Project | response_score=1.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:43:28 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.8 → 1.6 (delta=+0.8) | follow_ups: 1 → 2
22:43:28 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.6 < threshold=6.5 (25% done) | need 4.9 more | importance=HIGH
22:43:28 [INFO] eval_worker: [SATURATION] turn=17 | topic=Sensex Analysis Project | score_1.6_need_4.9 | signals=[depth_decay] | depth_decay→MOVE_ON
22:43:28 [INFO] eval_worker: [DECISION] turn=17 | depth_decay=True weak_exit=False saturated=False action=MOVE_ON
22:43:28 [INFO] eval_worker: [DECISION] ✅ DEPTH_DECAY fired → forcing MOVE_ON turn=17
22:43:28 [INFO] eval_worker: [SATURATION] MOVE_ON reason=depth_decay → next=Campaign Metrics and Slack Reporting System (importance=HIGH) turn=17
22:43:28 [INFO] eval_worker: [RESULT] turn=17  action=MOVE_ON   quality=1.25/SURFACE  signals=[depth_decay]  saturation=1.6/6.5  probe_index=0
         next=Campaign Metrics and Slack Reporting System         covered=['multi channel lead qualification system', 'sensex analysis project']
22:43:28 [INFO] eval_worker: [E2E_VERIFY] turn=17 | PIPELINE_OUTPUT:
  signals_fired    : ['depth_decay']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Campaign Metrics and Slack Reporting System'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Campaign Metrics and Slack Reporting System ↵ YOUR ONLY JOB THIS TURN: Ackn
  topic_after      : Campaign Metrics and Slack Reporting Sys (was: Sensex Analysis Project)
  covered_topics   : 2 total
22:43:29 [INFO] eval_worker: [WORKER] ✓ turn=17 action=MOVE_ON | scores: clarity=2.0 depth=1.0 fluency=2.0 confidence=1.0 | overall=1.25 | risk: integrity+0 depth+9
22:43:29 [INFO] eval_worker: [TOPIC_STATE] turn=17 | topic='Campaign Metrics and Slack Reporting Sys' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0 | signals=[depth_decay]
22:43:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:29 [INFO] eval_worker: ✅ TURN 17 DONE | action=MOVE_ON
22:43:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:52 [INFO] eval_worker: ✅ TURN 18 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:43:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:52 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Campaign Metrics and Slack Reporting System importance=HIGH | saturation_score=0.0/6.5 follow_ups=0 base_credit=0.8
22:43:52 [INFO] eval_worker: [TURN] INTERVIEW | turn=18 | active=Campaign Metrics and Slack Reporting System | covered=['multi channel lead qualification system', 'sensex analysis project'] | remaining=746s | mode=normal | saturation=0% (0.0/6.5)
22:43:52 [INFO] eval_worker: [QA] turn=18  Q: Thanks for being honest about that. Let’s try a different approach — tell me about a time during your internship at Niti AI when you had to learn something completely new quickly. How did you approach
              A: No. Sorry. Don't know about this as well.
22:43:52 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Personal Brand & Marketing Automation Strategist | discussed_log=2 entries
{"timestamp": "2026-05-29 22:43:52,900", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=8 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-29"}
22:43:53 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:43:55 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:43:55,061", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=verification depth_signal=SURFACE | clarity=1 depth=0 specificity=0 grounding=0 | reason=\"No. Sorry. Don't know about this as well.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-29"}
22:43:55 [INFO] eval_worker: [QUALITY] turn=18 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
22:43:55 [INFO] eval_worker: [EVAL] turn=18 action=PROBE mode=process quality_avg=0.25 signals=[example_evasion, depth_decay]
22:43:55 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=18
22:43:55 [INFO] eval_worker: [SIGNAL] name=depth_decay                  layer=intelligence_quality confidence=0.61 delta=-0.06 turn=18
22:43:55 [INFO] eval_worker: [SAT_CALC] topic=Campaign Metrics and Slack Reporting System | response_score=0.20 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
22:43:55 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.0 → 0.8 (delta=+0.8) | follow_ups: 0 → 1
22:43:55 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=0.8 < threshold=6.5 (12% done) | need 5.7 more | importance=HIGH
22:43:55 [INFO] eval_worker: [SATURATION] turn=18 | topic=Campaign Metrics and Slack Reporting System | score_0.8_need_5.7 | signals=[example_evasion, depth_decay] | depth_decay→MOVE_ON
22:43:55 [INFO] eval_worker: [DECISION] turn=18 | depth_decay=True weak_exit=False saturated=False action=PROBE
22:43:55 [INFO] eval_worker: [DECISION] ✅ DEPTH_DECAY fired → forcing MOVE_ON turn=18
22:43:55 [INFO] eval_worker: [SATURATION] MOVE_ON reason=depth_decay → next=Personal Brand & Marketing Automation Strategist (importance=HIGH) turn=18
22:43:55 [INFO] eval_worker: [RESULT] turn=18  action=MOVE_ON   quality=0.25/SURFACE  signals=[example_evasion, depth_decay]  saturation=0.8/6.5  probe_index=0
         next=Personal Brand & Marketing Automation Strategist    covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system']
22:43:55 [INFO] eval_worker: [E2E_VERIFY] turn=18 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion', 'depth_decay']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Personal Brand & Marketing Automation Strategist'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Personal Brand & Marketing Automation Strategist ↵ YOUR ONLY JOB THIS TURN:
  topic_after      : Personal Brand & Marketing Automation St (was: Campaign Metrics and Slack Reporting Sys)
  covered_topics   : 3 total
22:43:55 [INFO] eval_worker: [WORKER] ✓ turn=18 action=MOVE_ON | scores: clarity=1.0 depth=0.0 fluency=2.0 confidence=1.0 | overall=0.25 | risk: integrity+0 depth+24
22:43:55 [INFO] eval_worker: [TOPIC_STATE] turn=18 | topic='Personal Brand & Marketing Automation St' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0 | signals=[example_evasion, depth_decay]
22:43:55 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:43:55 [INFO] eval_worker: ✅ TURN 18 DONE | action=MOVE_ON
22:43:55 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:16 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:16 [INFO] eval_worker: ✅ TURN 19 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:44:16 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:16 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Personal Brand & Marketing Automation Strategist importance=HIGH | saturation_score=0.0/6.5 follow_ups=0 base_credit=0.8
22:44:16 [INFO] eval_worker: [TURN] INTERVIEW | turn=19 | active=Personal Brand & Marketing Automation Strategist | covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system'] | remaining=722s | mode=normal | saturation=0% (0.0/6.5)
22:44:16 [INFO] eval_worker: [QA] turn=19  Q: That’s okay, Vamsi. Let’s try something different — imagine you were given a new tool to work with for a campaign automation, but the documentation was limited. What would be your first steps to figur
              A: Okay. I am not sure.
22:44:16 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Python Developer | discussed_log=3 entries
{"timestamp": "2026-05-29 22:44:16,494", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=5 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 94, "taskName": "Task-31"}
22:44:17 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:44:19 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-29 22:44:19,409", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=null depth_signal=SURFACE | clarity=2 depth=0 specificity=0 grounding=0 | reason=Okay. I am not sure.", "logger": "interview-agent", "module": "agent_scoring", "line": 210, "taskName": "Task-31"}
22:44:19 [INFO] eval_worker: [QUALITY] turn=19 | clarity=2.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.50 weighted=0.40 depth_signal=SURFACE
22:44:19 [INFO] eval_worker: [EVAL] turn=19 action=PROBE mode=evidence quality_avg=0.50 signals=[none]
22:44:19 [INFO] eval_worker: [SAT_CALC] topic=Personal Brand & Marketing Automation Strategist | response_score=0.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:44:19 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.0 → 0.8 (delta=+0.8) | follow_ups: 0 → 1
22:44:19 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=0.8 < threshold=6.5 (12% done) | need 5.7 more | importance=HIGH
22:44:19 [INFO] eval_worker: [SATURATION] turn=19 | topic=Personal Brand & Marketing Automation Strategist | score_0.8_need_5.7 | signals=[none]
22:44:19 [INFO] eval_worker: [DECISION] turn=19 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:44:19 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=0.8/6.5 (12%) turn=19
22:44:19 [INFO] eval_worker: [PROBE] family=evidence rotation_index=0 signals=[none] | goal: They claimed a skill or capability but gave zero real instance of actually using
22:44:19 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=19 | action=PROBE(evidence) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'They claimed a skill or capability but gave zero real instance of actually using' | saturation=12%
22:44:19 [INFO] eval_worker: [PROBE] Rotation advanced: 0 → 1 (no signal) turn=19
22:44:19 [INFO] eval_worker: [RESULT] turn=19  action=PROBE     quality=0.50/SURFACE  signals=[none]  saturation=0.8/6.5  probe_index=1
         next=Personal Brand & Marketing Automation Strategist    covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system']
22:44:19 [INFO] eval_worker: [E2E_VERIFY] turn=19 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Personal Brand & Marketing Automation Strategist' (evidence)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (EVIDENCE) ↵ NEXT MOVE: They claimed a skill or capability but gave zero real instance of actua
  topic_after      : Personal Brand & Marketing Automation St (was: Personal Brand & Marketing Automation St)
  covered_topics   : 3 total
22:44:19 [INFO] eval_worker: [WORKER] ✓ turn=19 action=PROBE | scores: clarity=2.0 depth=0.0 fluency=5.0 confidence=1.0 | overall=0.50 | risk: integrity+0 depth+3
22:44:19 [INFO] eval_worker: [TOPIC_STATE] turn=19 | topic='Personal Brand & Marketing Automation St' | importance=HIGH | saturated=False | progress: 0.8/6.5 (12% done, 5.7 remaining) | follow_ups=1 (opened_turn=0) | probe_mode=1
22:44:19 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:19 [INFO] eval_worker: ✅ TURN 19 DONE | action=PROBE
22:44:19 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:28 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:28 [INFO] eval_worker: ✅ TURN 20 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:44:28 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:28 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Personal Brand & Marketing Automation Strategist importance=HIGH | saturation_score=0.8/6.5 follow_ups=1 base_credit=0.8
22:44:28 [INFO] eval_worker: [TURN] INTERVIEW | turn=20 | active=Personal Brand & Marketing Automation Strategist | covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system'] | remaining=711s | mode=normal | saturation=12% (0.8/6.5)
22:44:28 [INFO] eval_worker: [QA] turn=20  Q: Take your time — what’s the first thing you’d probably try or look for in that situation?
              A: I'm not sure. Sorry.
22:44:28 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Python Developer | discussed_log=3 entries
22:44:29 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:44:29 [INFO] eval_worker: [QUALITY] turn=20 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
22:44:29 [INFO] eval_worker: [EVAL] turn=20 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
22:44:29 [INFO] eval_worker: [SAT_CALC] topic=Personal Brand & Marketing Automation Strategist | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
22:44:29 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 0.8 → 1.6 (delta=+0.8) | follow_ups: 1 → 2
22:44:29 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.6 < threshold=6.5 (25% done) | need 4.9 more | importance=HIGH
22:44:29 [INFO] eval_worker: [SATURATION] turn=20 | topic=Personal Brand & Marketing Automation Strategist | score_1.6_need_4.9 | signals=[none]
22:44:29 [INFO] eval_worker: [DECISION] turn=20 | depth_decay=False weak_exit=False saturated=False action=PROBE
22:44:29 [INFO] eval_worker: [DECISION] 🔄 PROBE NOT SATURATED → continue on topic | score=1.6/6.5 (25%) turn=20
22:44:29 [INFO] eval_worker: [PROBE] family=ownership rotation_index=1 signals=[none] | goal: Find out what was specifically theirs — what they personally decided, built, or
22:44:29 [INFO] eval_worker: [SIGNAL→BEHAVIOR] turn=20 | action=PROBE(ownership) | signals=[none] | EXPECTED_BEHAVIOR: agent asks 'Find out what was specifically theirs — what they personally decided, built, or ' | saturation=25%
22:44:29 [INFO] eval_worker: [PROBE] Rotation advanced: 1 → 2 (no signal) turn=20
22:44:29 [INFO] eval_worker: [RESULT] turn=20  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.6/6.5  probe_index=2
         next=Personal Brand & Marketing Automation Strategist    covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system']
22:44:29 [INFO] eval_worker: [E2E_VERIFY] turn=20 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Personal Brand & Marketing Automation Strategist' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ NEXT MOVE: Find out what was specifically theirs — what they personally decided,
  topic_after      : Personal Brand & Marketing Automation St (was: Personal Brand & Marketing Automation St)
  covered_topics   : 3 total
22:44:29 [INFO] eval_worker: [WORKER] ✓ turn=20 action=PROBE | scores: clarity=1.0 depth=0.0 fluency=1.0 confidence=1.0 | overall=0.25 | risk: integrity+0 depth+3
22:44:29 [INFO] eval_worker: [TOPIC_STATE] turn=20 | topic='Personal Brand & Marketing Automation St' | importance=HIGH | saturated=False | progress: 1.6/6.5 (25% done, 4.9 remaining) | follow_ups=2 (opened_turn=0) | probe_mode=2
22:44:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:29 [INFO] eval_worker: ✅ TURN 20 DONE | action=PROBE
22:44:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:44 [INFO] eval_worker: ✅ TURN 21 STARTED | app_id=app-vamsi-resume-gtm-cmpr67k-9159
22:44:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:44 [INFO] eval_worker: [TOPIC_STATE] RESTORED | topic=Personal Brand & Marketing Automation Strategist importance=HIGH | saturation_score=1.6/6.5 follow_ups=2 base_credit=0.8
22:44:44 [INFO] eval_worker: [TURN] INTERVIEW | turn=21 | active=Personal Brand & Marketing Automation Strategist | covered=['multi channel lead qualification system', 'sensex analysis project', 'campaign metrics and slack reporting system'] | remaining=694s | mode=normal | saturation=25% (1.6/6.5)
22:44:44 [INFO] eval_worker: [QA] turn=21  Q: No worries at all. Let’s try one last thing—tell me about a time, even outside of work or projects, when you faced a challenge and how you went about solving it.
              A: I didn't solve anything.
22:44:44 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Python Developer | discussed_log=3 entries
22:44:45 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
22:44:45 [INFO] eval_worker: [QUALITY] turn=21 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
22:44:45 [INFO] eval_worker: [EVAL] turn=21 action=PROBE mode=process quality_avg=0.25 signals=[example_evasion, latency_mismatch]
22:44:45 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=21
22:44:45 [INFO] eval_worker: [SIGNAL] name=latency_mismatch             layer=behavioral_confidence confidence=0.58 delta=-0.10 turn=21
22:44:45 [INFO] eval_worker: [SAT_CALC] topic=Personal Brand & Marketing Automation Strategist | response_score=0.20 contribution=0.00 signal_modifier=-2.50 final_contribution=0.00
22:44:45 [INFO] eval_worker: [SAT_CALC] base_credit=0.8 | score: 1.6 → 2.4 (delta=+0.8) | follow_ups: 2 → 3
22:44:45 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=2.4 < threshold=6.5 (37% done) | need 4.1 more | importance=HIGH
22:44:45 [INFO] eval_worker: [SATURATION] turn=21 | topic=Personal Brand & Marketing Automation Strategist | score_2.4_need_4.1 | signals=[example_evasion, latency_mismatch]
22:44:45 [INFO] eval_worker: [DECISION] turn=21 | depth_decay=False weak_exit=True saturated=False action=PROBE
22:44:45 [INFO] eval_worker: [DECISION] ✅ WEAK_CANDIDATE_EXIT → turns=3 score=2.4 < min=2.9 → forcing MOVE_ON turn=21
22:44:45 [INFO] eval_worker: [SATURATION] MOVE_ON reason=weak_candidate_exit(turns=3 score=2.4 min=2.9) → next=Python Developer (importance=HIGH) turn=21
22:44:45 [INFO] eval_worker: [RESULT] turn=21  action=MOVE_ON   quality=0.25/SURFACE  signals=[example_evasion, latency_mismatch]  saturation=2.4/6.5  probe_index=2
         next=Python Developer                                    covered=['multi channel lead qualification system', 'personal brand marketing automation strategist', 'sensex analysis project', 'campaign metrics and slack reporting system']
22:44:45 [INFO] eval_worker: [E2E_VERIFY] turn=21 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion', 'latency_mismatch']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Python Developer'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Python Developer ↵ YOUR ONLY JOB THIS TURN: Acknowledge briefly and move to
  topic_after      : Python Developer (was: Personal Brand & Marketing Automation St)
  covered_topics   : 4 total
22:44:45 [INFO] eval_worker: [WORKER] ✓ turn=21 action=MOVE_ON | scores: clarity=1.0 depth=0.0 fluency=1.0 confidence=1.0 | overall=0.25 | risk: integrity+0 depth+28
22:44:45 [INFO] eval_worker: [TOPIC_STATE] turn=21 | topic='Python Developer' | importance=HIGH | saturated=False | progress: 0.0/6.5 (0% done, 6.5 remaining) | follow_ups=0 (opened_turn=0) | probe_mode=0 | signals=[example_evasion, latency_mismatch]
22:44:45 [INFO] eval_worker: ────────────────────────────────────────────────────────────
22:44:45 [INFO] eval_worker: ✅ TURN 21 DONE | action=MOVE_ON
22:44:45 [INFO] eval_worker: ────────────────────────────────────────────────────────────
