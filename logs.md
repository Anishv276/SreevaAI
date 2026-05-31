agent:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python agent.py dev
    17:22:08.339 DEBUG    asyncio            Using proactor: IocpProactor
    17:22:08.346 DEV      livekit.agents     Watching C:\Users\vamsi\OneDrive\Desktop\HR-updates
    17:22:17.404 DEBUG    asyncio            Using proactor: IocpProactor
    17:22:17.436 INFO     livekit.agents     starting worker {"version": "1.5.10", "rtc-version": "1.1.8"}
    17:22:17.440 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.cartesia", "version": "1.5.10"}
    17:22:17.443 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.deepgram", "version": "1.5.10"}
    17:22:17.446 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.openai", "version": "1.5.10"}
    17:22:17.449 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.sarvam", "version": "1.5.10"}
    17:22:17.452 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.silero", "version": "1.5.10"}
    17:22:17.455 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.elevenlabs", "version": "1.5.10"}
    17:22:17.463 INFO     livekit.agents     HTTP server listening on :59726
    17:22:17.474 INFO     livekit.agents     initializing job runner {"tid": 484}
{"timestamp": "2026-05-31 17:22:17,477", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 405, "taskName": null}
{"timestamp": "2026-05-31 17:22:18,110", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 408, "taskName": null}
{"timestamp": "2026-05-31 17:22:18,113", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-05-31 17:22:18,115", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 416, "taskName": null}
{"timestamp": "2026-05-31 17:22:18,119", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 421, "taskName": null}
{"timestamp": "2026-05-31 17:22:18,122", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 436, "taskName": null}
    17:22:18.124 INFO     livekit.agents     job runner initialized {"tid": 484, "elapsed_time": 0.65}
    17:22:18.130 DEBUG    asyncio            Using proactor: IocpProactor
    17:22:18.458 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id": "AW_tHMELfiKC38t", "url":
"wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India West", "protocol": 17}
    17:22:46.404 INFO     livekit.agents     received job request
                                         {"job_id": "AJ_xz5NLPHhbq5g", "dispatch_id": "AD_oGweRpyKCDuG", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "room_id": "RM_kYWA4yX3JMM5", "agent_name": "ai_interviewer", "resuming":
false, "enable_recording": false}
    17:22:46.464 DEBUG    livekit.agents     received assignment
                                         {"agent_name": "ai_interviewer", "room_id": "RM_kYWA4yX3JMM5", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "job_id": "AJ_xz5NLPHhbq5g", "dispatch_id": "AD_oGweRpyKCDuG",
"enable_recording": false}
{"timestamp": "2026-05-31 17:22:46,472", "level": "INFO", "message": "Connecting to room interview_app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_runtime", "line": 517, "taskName": "job_user_entrypoint"}
{"timestamp": "2026-05-31 17:22:46,473", "level": "INFO", "message": "[SESSION] interview context loaded", "logger": "interview-agent", "module": "agent_runtime", "line": 572, "taskName": "job_user_entrypoint", "event": "session_start", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541"}
    17:22:46.503 INFO     livekit.agents     initializing job runner {"tid": 10328}
{"timestamp": "2026-05-31 17:22:46,505", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 405, "taskName": null}
{"timestamp": "2026-05-31 17:22:46,689", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 408, "taskName": null}
{"timestamp": "2026-05-31 17:22:46,690", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-05-31 17:22:46,690", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 416, "taskName": null}
{"timestamp": "2026-05-31 17:22:46,691", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 421, "taskName": null}
{"timestamp": "2026-05-31 17:22:46,691", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 436, "taskName": null}
    17:22:46.692 DEBUG    asyncio            Using proactor: IocpProactor
    17:22:46.694 INFO     livekit.agents     job runner initialized {"tid": 10328, "elapsed_time": 0.19}
{"timestamp": "2026-05-31 17:22:47,323", "level": "INFO", "message": "[STARTUP] Fetched  resume=YES jd=NO custom_q=0 | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 656, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,323", "level": "INFO", "message": "[STARTUP] Custom questions: NONE configured", "logger": "interview-agent", "module": "agent_runtime", "line": 671, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,324", "level": "INFO", "message": "[FLOW] Custom questions  none configured", "logger": "interview-agent", "module": "agent_runtime", "line": 679, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,325", "level": "INFO", "message": "[FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 737, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,325", "level": "INFO", "message": "[INTERVIEW_CONTEXT]\nCANDIDATE: Vadla Vamsi Krishna | ROLE: GTM engineer | BAND: fresher | TIME: 20m\n\nFETCH SUMMARY:\n  Resume: fetched | JD: MISSING | Custom Q: 0\n  JD Must-Have Skills: none\n  JD Nice-To-Have: none\n  Coverage Targets: python, ai, datascience, powerbi, n8n, zapier, Multi Channel Lead Qualification System, Sensex Analysis Project\n\nRESUME BRIEF:\n  Anchor: Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website] (type: project)\n  Skills: python, ai, datascience, powerbi, n8n\n  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System\n  Work History: Personal Brand & Marketing Automation Strategist | Python Developer\n  Internships: none\n  Education: B.Tech | MPC\n\nINTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. Open with: 'Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website]'. Band=fresher: probe HOW they think  real decisions, specifics, learning signals. Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural.", "logger": "interview-agent", "module": "agent_runtime", "line": 817, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,330", "level": "INFO", "message": "[FLOW] System prompt ready  greeting  warmup  interview", "logger": "interview-agent", "module": "agent_runtime", "line": 843, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,330", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3-general language=en-US diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,331", "level": "INFO", "message": "[TTS] Using SARVAM  voice=priya model=bulbul:v3", "logger": "interview-agent", "module": "agent_runtime", "line": 853, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:47,331", "level": "INFO", "message": "[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en voice=priya api_key_len=36", "logger": "interview-agent", "module": "agent_providers", "line": 613, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,302", "level": "INFO", "message": "[FLOW] Greeting precomputed during launching phase", "logger": "interview-agent", "module": "agent_runtime", "line": 881, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:22:48.308 DEBUG    livekit.agents     input stream attached
                                         {"participant": null, "source": "SOURCE_UNKNOWN", "accepted_sources":
["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:48.319 INFO     livekit.agents     adaptive interruption detector initialized
                                         {"base_url": "https://agent-gateway.livekit.cloud/v1", "detection_interval":
0.1, "audio_prefix_duration": 1.0, "max_audio_duration": 3, "min_frames": 2, "threshold": 0.5, "inference_timeout": 0.7,
"use_proxy": true, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:48.328 DEBUG    livekit.agents     http_session(): creating a new httpclient ctx
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:48.338 DEBUG    livekit.agents     start reading stream
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmps7cu-8541", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:48.342 DEBUG    livekit.agents     using audio io: `RoomIO` -> `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:48.346 DEBUG    livekit.agents     using transcript io: `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:22:48,352", "level": "INFO", "message": "[FLOW] launch_prereqs_ready signal sent to frontend", "logger": "interview-agent", "module": "agent_runtime", "line": 1050, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,352", "level": "INFO", "message": "[FLOW] Session started  candidate=Vadla Vamsi Krishna role=GTM engineer band=fresher tts=SARVAM llm=gpt-4.1-mini boot=1879ms", "logger": "interview-agent", "module": "agent_runtime", "line": 2176, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,353", "level": "INFO", "message": "[FLOW] Greeting started  20-min interview timer begins NOW", "logger": "interview-agent", "module": "agent_runtime", "line": 2191, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,359", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=f13067e3b986 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,363", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the G T M engineer role. How are you doing? Hope the day's been good to you.\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,363", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,540", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmps7cu-8541 marked as IN_PROGRESS.", "logger": "interview-agent", "module": "agent_persistence", "line": 968, "taskName": "Task-62", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,562", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=f13067e3b986 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:48,702", "level": "INFO", "message": "[REDIS_EVAL] Redis eval client connected and ping OK  redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768", "logger": "interview-agent", "module": "agent_runtime", "line": 999, "taskName": "Task-35", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:22:48.828 DEBUG    livekit.agents     aec warmup active, disabling interruptions for 0.50s
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:22:48,832", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:22:49.180 DEBUG    livekit.….deepgram Established new Deepgram STT WebSocket connection:
                                           {"headers": {"dg-project-id": "9ac4806b-a6d5-44a5-bf62-c3c6bbfc33e1",
"dg-request-id": "019e7de1-2af6-7b60-94df-710c9b3fde95", "Date": "Sun, 31 May 2026 11:52:49 GMT"}, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:22:49.502 DEBUG    livekit.agents     aec warmup expired, re-enabling interruptions
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:22:54,319", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=f13067e3b986 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:54,319", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=f13067e3b986 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:22:54,357", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=f13067e3b986 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,129", "level": "DEBUG", "message": "Transcript: Interviewer[12]: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM engineer role. How are you doing? Hope the day's been good to you.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 189, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,130", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=0 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1896, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,130", "level": "INFO", "message": "âœ… TURN 1 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,131", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,131", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,133", "level": "INFO", "message": "[TRANSCRIPT] Greeting appended to transcript (session.say bypass)", "logger": "interview-agent", "module": "agent_runtime", "line": 2213, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,133", "level": "INFO", "message": "[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)", "logger": "interview-agent", "module": "agent_runtime", "line": 2214, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,134", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:01,135", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started after greeting delivery", "logger": "interview-agent", "module": "agent_runtime", "line": 2259, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:03,385", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:23:06.420 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I'm doing great. How about you?", "language": "en-US",
"transcript_delay": 2.033371925354004, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:23:06,431", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 warmup â€” skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 1958, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,432", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 fragment #1: 'I'm doing great. How about you?...' (consolidated: 'I'm doing great. How about you?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,433", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 - debounce 0.30s (is_complete=True, words=6)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,436", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=57545a9b9c06 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,650", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=57545a9b9c06 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,734", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=1 - 1 fragments  complete utterance (sentence_complete): 'I'm doing great. How about you?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-213", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,734", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing greeting replay (turn already processed): 'I'm doing great. How about you?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1232, "taskName": "Task-213", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,831", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,833", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:06,833", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-196", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:10,649", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Ha, good! Been a packed day of interviews, happy to have a good chat now. Ready to jump in?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-207", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:10,650", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-207", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:11,012", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:13,239", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=57545a9b9c06 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:13,241", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=57545a9b9c06 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:13,294", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=57545a9b9c06 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:16,317", "level": "DEBUG", "message": "Transcript: Interviewer[27]: Ha, good! Been a packed day of interviews — happy to have a good chat now. Ready to jump in?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:16,319", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=1 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1896, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:16,319", "level": "INFO", "message": "âœ… TURN 2 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:16,320", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:16,320", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:17,587", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:23:18.487 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.702263355255127, "max_delay": 2.0,
"min_delay": 0.8, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:23:22.166 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah.", "language": "en-US", "transcript_delay":
4.232570648193359, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:23:22,173", "level": "INFO", "message": "[WARMUP]  WARMUP COMPLETE at turn=2  INTERVIEW PHASE ACTIVE", "logger": "interview-agent", "module": "agent_runtime", "line": 1944, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,173", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 warmup â€” skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 1958, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,174", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 fragment #1: 'Yeah....' (consolidated: 'Yeah....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,174", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 - debounce 1.00s (is_complete=False, words=1)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,177", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=6bbc22e88e18 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,410", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=6bbc22e88e18 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,573", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,574", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:22,574", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:23,177", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=2 - 1 fragments  complete utterance (debounce_timeout): 'Yeah....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-326", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:23,177", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (1 words): 'Yeah.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1272, "taskName": "Task-326", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:23,964", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Great, let's get into it! You created an automated lead capture system across multiple channels like Instagram, Facebook, website, and email. What was the hardest part of building that unified workflow?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-320", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:23,965", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-320", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:24,328", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:29,289", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=6bbc22e88e18 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:29,290", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=6bbc22e88e18 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:29,333", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=6bbc22e88e18 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,327", "level": "DEBUG", "message": "Transcript: Interviewer[46]: Great, let's get into it! You created an automated lead capture system across multiple channels like Instagram, Facebook, website, and email. What was the hardest part of building that unified workflow?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,328", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=2 last_q='What was the hardest part of building that unified workflow?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,329", "level": "INFO", "message": "[PHASE_STATUS] Opening question sealed: 'What was the hardest part of building that unified workflow?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1885, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,330", "level": "INFO", "message": "[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)", "logger": "interview-agent", "module": "agent_runtime", "line": 1894, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,330", "level": "INFO", "message": "âœ… TURN 3 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,331", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:35,331", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:38,285", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:23:42.635 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.415723562240601, "max_delay": 2.0,
"min_delay": 0.8, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:23:42.898 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "The other part is integrating API. And, also,",
"language": "en-US", "transcript_delay": 0.8143277168273926, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:23:42,908", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 fragment #1: 'The other part is integrating API. And, also,...' (consolidated: 'The other part is integrating API. And, also,...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:42,908", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:42,912", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=544c7d8536aa model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,114", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=544c7d8536aa payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,210", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=3 - 1 fragments  complete utterance (sentence_complete): 'The other part is integrating API. And, also,...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,210", "level": "DEBUG", "message": "Transcript: Candidate[54]: The other part is integrating API. And, also,", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,212", "level": "INFO", "message": "[EVAL_GATE] turn=3 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,226", "level": "INFO", "message": "[LIVE_N] turn=3 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,329", "level": "INFO", "message": "[TRANSCRIPT] Partial save 4 lines, 54s duration, 1 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-467", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,435", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,495", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=3 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:43,496", "level": "INFO", "message": "[LIVE_N] turn=3 | clearing warmup context after payload push", "logger": "interview-agent", "module": "agent_runtime", "line": 1574, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:23:44.634 DEBUG    livekit.agents     min endpointing delay updated: 0.8 -> 0.8511517238616944
                                         {"reason": "pause between utterances", "pause": 1.3115172386169434,
"max_delay": 2.0, "min_delay": 0.8511517238616944, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:23:47.439 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "training prompt.", "language": "en-US",
"transcript_delay": 3.3536338806152344, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:23:47,796", "level": "WARNING", "message": "[LIVE_N] â° turn=3 | routing timeout (4.3s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-466", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:47,797", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-449", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:47,798", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-449", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:47,798", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-449", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:48,815", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, integrating A P I s can definitely be tricky. Can you give me a specific example of one A P I integration that was challenging and how you handled it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-460", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:48,815", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-460", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:49,169", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:53,576", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=544c7d8536aa model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:53,577", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=544c7d8536aa model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:53,623", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=544c7d8536aa close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:59,437", "level": "DEBUG", "message": "Transcript: Interviewer[71]: Okay, integrating APIs can definitely be tricky. Can you give me a specific example of one API integration that was challenging and how you handled it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:59,437", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=3 last_q='Can you give me a specific example of one API integration th' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:59,437", "level": "INFO", "message": "âœ… TURN 4 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:59,438", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:23:59,439", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:01,419", "level": "INFO", "message": "[TIMER] remaining=1127s turn=4", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:03,085", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:04.643 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So the main thing is", "language": "en-US",
"transcript_delay": 0.007462739944458008, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:24:06.834 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.11031699180603, "max_delay": 2.0,
"min_delay": 0.8511517238616944, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:06,935", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:08.742 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "meta API because we need a lot of approvals for that.",
"language": "en-US", "transcript_delay": 0.006087064743041992, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:24:09.685 DEBUG    livekit.agents     min endpointing delay updated: 0.8511517238616944 -> 0.8272986345291138
                                         {"reason": "pause between utterances", "pause": 0.6126208305358887,
"max_delay": 2.0, "min_delay": 0.8272986345291138, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:10,016", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 fragment #1: 'training prompt. So the main thing is meta API bec...' (consolidated: 'training prompt. So the main thing is meta API because we ne...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,016", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 - debounce 0.30s (is_complete=True, words=18)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,018", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=3a8a617935e0 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,241", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=3a8a617935e0 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,318", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=4 - 1 fragments  complete utterance (sentence_complete): 'training prompt. So the main thing is meta API because we need a lot of approval...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,318", "level": "DEBUG", "message": "Transcript: Candidate[81]: training prompt. So the main thing is meta API because we need a lot of approvals for that.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,319", "level": "INFO", "message": "[EVAL_GATE] turn=4 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,319", "level": "INFO", "message": "[LIVE_N] turn=4 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,433", "level": "INFO", "message": "[TRANSCRIPT] Partial save 6 lines, 81s duration, 2 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-627", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:10,897", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=4 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:11.430 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So that that is where we have faced a lot of issues.",
"language": "en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:12,262", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-621", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,263", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-621", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,264", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=3a8a617935e0 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,264", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=3a8a617935e0 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,266", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,266", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,269", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 already processed â€” dropping late fragment 'So that that is where we have faced a lot of issues.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,272", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=5ad3c88cb173 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:12,480", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=5ad3c88cb173 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:13,991", "level": "WARNING", "message": "[LIVE_N] â° turn=4 | routing timeout (3.1s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-626", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:13,993", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-648", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:13,994", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-648", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:13,994", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-648", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:15,249", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, dealing with Meta’s A P I approval process sounds frustrating. How did you work around those approval challenges while building the lead capture system?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-658", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:15,250", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-658", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:15,533", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:19,967", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=5ad3c88cb173 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:19,971", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=5ad3c88cb173 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:20,028", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=5ad3c88cb173 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:25,461", "level": "DEBUG", "message": "Transcript: Interviewer[97]: Got it, dealing with Meta’s API approval process sounds frustrating. How did you work around those approval challenges while building the lead capture system?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:25,461", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=4 last_q='How did you work around those approval challenges while buil' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:25,462", "level": "INFO", "message": "âœ… TURN 5 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:25,462", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:25,463", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:28,286", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:31.632 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Like, you know, whenever", "language": "en-US",
"transcript_delay": 0.04682779312133789, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:24:35.404 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "it's something that is he may have to contact Meta, then
after", "language": "en-US", "transcript_delay": 0.017853736877441406, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:24:39.401 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "then we'll get to know their customer support.",
"language": "en-US", "transcript_delay": 0.014634847640991211, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:24:42.685 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.423353433609009, "max_delay": 2.0,
"min_delay": 0.8272986345291138, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:42,967", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 fragment #1: 'Like, you know, whenever it's something that is he...' (consolidated: 'Like, you know, whenever it's something that is he may have ...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:42,967", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 - debounce 0.30s (is_complete=True, words=24)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:42,970", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=bedd2769a697 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:42.998 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "After that, we will decide whether to go with another
API.", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:43,192", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=bedd2769a697 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,269", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=5 - 1 fragments  complete utterance (sentence_complete): 'Like, you know, whenever it's something that is he may have to contact Meta, the...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,271", "level": "DEBUG", "message": "Transcript: Candidate[114]: Like, you know, whenever it's something that is he may have to contact Meta, then after then we'll get to know their customer support.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,271", "level": "INFO", "message": "[EVAL_GATE] turn=5 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,272", "level": "INFO", "message": "[LIVE_N] turn=5 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,377", "level": "INFO", "message": "[TRANSCRIPT] Partial save 8 lines, 114s duration, 3 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-819", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,829", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-806", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,829", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-806", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,833", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=bedd2769a697 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,834", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=bedd2769a697 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,837", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,838", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,843", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 already processed â€” dropping late fragment 'After that, we will decide whether to go with another API.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,846", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=2ec437e0da3b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:43,897", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=5 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:44,082", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=2ec437e0da3b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:46,185", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:46,302", "level": "WARNING", "message": "[LIVE_N] â° turn=5 | routing timeout (2.4s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-818", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:46,303", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-829", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:46,304", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-829", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:46,305", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-829", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:24:47.234 DEBUG    livekit.agents     min endpointing delay updated: 0.8272986345291138 -> 1.1457045971870423
                                         {"reason": "pause between utterances", "pause": 4.011358261108398, "max_delay":
2.0, "min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:24:47,711", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That makes sense, so you had to weigh the tradeoff between waiting for Meta’s support versus switching to a different A P I. How did you decide when to stick with Meta and when to switch?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-839", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:47,712", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-839", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:47,975", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:52,934", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=2ec437e0da3b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:52,935", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=2ec437e0da3b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:52,993", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=2ec437e0da3b close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:59,223", "level": "DEBUG", "message": "Transcript: Interviewer[130]: That makes sense—so you had to weigh the tradeoff between waiting for Meta’s support versus switching to a different API. How did you decide when to stick with Meta and when to switch?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:59,224", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=5 last_q='How did you decide when to stick with Meta and when to switc' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:59,224", "level": "INFO", "message": "âœ… TURN 6 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:59,225", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:24:59,225", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:01,476", "level": "INFO", "message": "[TIMER] remaining=1067s turn=6", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:02,039", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:25:06.785 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "There's nothing. If meta doesn't work, then we'll switch
to other API.", "language": "en-US", "transcript_delay": 0.0507657527923584, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:25:07.385 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 1.9316349267959594
                                         {"reason": "new turn", "pause": 1.3163492679595947, "max_delay":
1.9316349267959594, "min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:25:07,985", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 fragment #1: 'There's nothing. If meta doesn't work, then we'll ...' (consolidated: 'There's nothing. If meta doesn't work, then we'll switch to ...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:07,985", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 - debounce 0.30s (is_complete=True, words=12)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:07,990", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=c81607febfcf model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:25:08.135 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Not then we'll move with Meta.", "language": "en-US",
"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:25:08,199", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=c81607febfcf payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,287", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=6 - 1 fragments  complete utterance (sentence_complete): 'There's nothing. If meta doesn't work, then we'll switch to other API....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,287", "level": "DEBUG", "message": "Transcript: Candidate[139]: There's nothing. If meta doesn't work, then we'll switch to other API.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,287", "level": "INFO", "message": "[EVAL_GATE] turn=6 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,288", "level": "INFO", "message": "[LIVE_N] turn=6 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,395", "level": "INFO", "message": "[TRANSCRIPT] Partial save 10 lines, 139s duration, 4 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1002", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:08,891", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=6 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,286", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-990", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,286", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-990", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,288", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=c81607febfcf model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,288", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=c81607febfcf close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,289", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,290", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,293", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 already processed â€” dropping late fragment 'Not then we'll move with Meta.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,299", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=1ae298bfc8b3 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:09,542", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=1ae298bfc8b3 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:11,095", "level": "WARNING", "message": "[LIVE_N] â° turn=6 | routing timeout (2.2s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1001", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:11,096", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1015", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:11,097", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1015", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:11,097", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1015", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:12,589", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, so it was more of a fallback plan, stick with Meta if it works, otherwise switch to an alternative. What was the alternative A P I you considered or used in case Meta wasn’t an option?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1025", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:12,589", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1025", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:12,873", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:17,940", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=1ae298bfc8b3 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:17,945", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=1ae298bfc8b3 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:17,993", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=1ae298bfc8b3 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:24,168", "level": "DEBUG", "message": "Transcript: Interviewer[155]: Okay, so it was more of a fallback plan—stick with Meta if it works, otherwise switch to an alternative. What was the alternative API you considered or used in case Meta wasn’t an option?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:24,169", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=6 last_q='What was the alternative API you considered or used in case ' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:24,169", "level": "INFO", "message": "âœ… TURN 7 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:24,170", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:24,170", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:26,086", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:25:30.238 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Then we what we'll do, there is no alternative. We have to
talk to Meta team itself.", "language": "en-US", "transcript_delay": 0.302903413772583, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:25:30.486 DEBUG    livekit.agents     max endpointing delay updated due to pause: 1.9316349267959594 -> 2.0
                                         {"reason": "new turn", "pause": 6.0628662109375, "max_delay": 2.0, "min_delay":
1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:25:31,084", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 fragment #1: 'Then we what we'll do, there is no alternative. We...' (consolidated: 'Then we what we'll do, there is no alternative. We have to t...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,084", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 - debounce 0.30s (is_complete=True, words=17)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,088", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=49616a4da589 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,332", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=49616a4da589 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,386", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=7 - 1 fragments  complete utterance (sentence_complete): 'Then we what we'll do, there is no alternative. We have to talk to Meta team its...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,387", "level": "DEBUG", "message": "Transcript: Candidate[163]: Then we what we'll do, there is no alternative. We have to talk to Meta team itself.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,387", "level": "INFO", "message": "[EVAL_GATE] turn=7 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,388", "level": "INFO", "message": "[LIVE_N] turn=7 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,488", "level": "INFO", "message": "[TRANSCRIPT] Partial save 12 lines, 163s duration, 5 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1176", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:31,988", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=7 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:34,195", "level": "WARNING", "message": "[LIVE_N] â° turn=7 | routing timeout (2.2s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1175", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:34,195", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1159", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:34,196", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1159", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:34,196", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1159", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:35,726", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I appreciate that, thanks for being straight with me. So reaching out directly to the Meta team was essential. How did you coordinate or manage that communication? Was it just you, or did you have a team involved?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1170", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:35,727", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1170", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:36,069", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:41,014", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=49616a4da589 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:41,014", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=49616a4da589 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:41,064", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=49616a4da589 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:47,459", "level": "DEBUG", "message": "Transcript: Interviewer[179]: I appreciate that, thanks for being straight with me. So reaching out directly to the Meta team was essential. How did you coordinate or manage that communication? Was it just you, or did you have a team involved?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:47,460", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=7 last_q='Was it just you, or did you have a team involved?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:47,460", "level": "INFO", "message": "âœ… TURN 8 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:47,461", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:47,461", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:49,438", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:25:50.735 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.1585729122161865, "max_delay": 2.0,
"min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:25:52.298 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. It's just me.", "language": "en-US",
"transcript_delay": 2.1120386123657227, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:25:52,305", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 fragment #1: 'No. It's just me....' (consolidated: 'No. It's just me....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,305", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,309", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=fcdd96a63681 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,608", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=8 - 1 fragments  complete utterance (sentence_complete): 'No. It's just me....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,609", "level": "DEBUG", "message": "Transcript: Candidate[184]: No. It's just me.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,609", "level": "INFO", "message": "[EVAL_GATE] turn=8 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:52,610", "level": "INFO", "message": "[LIVE_N] turn=8 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:53,029", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=fcdd96a63681 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:53,197", "level": "INFO", "message": "[TRANSCRIPT] Partial save 14 lines, 184s duration, 6 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1335", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:53,694", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=8 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:54,299", "level": "WARNING", "message": "[LIVE_N] â° turn=8 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1334", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:54,300", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1317", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:54,301", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1317", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:54,301", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1317", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:55,444", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"That's actually a smart call, handling that communication solo takes initiative. How did you keep track of the conversations and any action items during that process?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1328", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:55,445", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1328", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:25:55,847", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:00,257", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=fcdd96a63681 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:00,258", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=fcdd96a63681 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:00,292", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=fcdd96a63681 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:01,524", "level": "INFO", "message": "[TIMER] remaining=1007s turn=8", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:05,932", "level": "DEBUG", "message": "Transcript: Interviewer[197]: That's actually a smart call—handling that communication solo takes initiative. How did you keep track of the conversations and any action items during that process?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:05,932", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=8 last_q='How did you keep track of the conversations and any action i' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:05,933", "level": "INFO", "message": "âœ… TURN 9 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:05,933", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:05,933", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:11,936", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:26:16.240 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. Not like that. I will just contact with the",
"language": "en-US", "transcript_delay": 0.0051403045654296875, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:26:16.785 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.688144683837891, "max_delay": 2.0,
"min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:26:17,384", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 fragment #1: 'No. Not like that. I will just contact with the...' (consolidated: 'No. Not like that. I will just contact with the...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,384", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 - debounce 0.30s (is_complete=True, words=10)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,393", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=583830a7b394 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,600", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=583830a7b394 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,686", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=9 - 1 fragments  complete utterance (sentence_complete): 'No. Not like that. I will just contact with the...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,687", "level": "DEBUG", "message": "Transcript: Candidate[209]: No. Not like that. I will just contact with the", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,687", "level": "INFO", "message": "[EVAL_GATE] turn=9 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,687", "level": "INFO", "message": "[LIVE_N] turn=9 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:17,785", "level": "INFO", "message": "[TRANSCRIPT] Partial save 16 lines, 209s duration, 7 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1473", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:18,292", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=9 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:26:19.142 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "support, and we'll wait for their reply. Okay.",
"language": "en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:26:20,292", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-1467", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,293", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1467", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,294", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=583830a7b394 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,294", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=583830a7b394 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,295", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,295", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,299", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 already processed â€” dropping late fragment 'support, and we'll wait for their reply. Okay.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,302", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=a0166915288c model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,500", "level": "WARNING", "message": "[LIVE_N] â° turn=9 | routing timeout (2.2s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1472", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,526", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=a0166915288c payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,699", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1494", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,700", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1494", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:20,700", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1494", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:22,203", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, so it was more reactive, reach out and then wait for a response. What did you do in the meantime to keep the project moving forward while waiting for those replies?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1504", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:22,204", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1504", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:22,471", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:27,252", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=a0166915288c model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:27,253", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=a0166915288c model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:27,304", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=a0166915288c close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:33,072", "level": "DEBUG", "message": "Transcript: Interviewer[224]: Got it, so it was more reactive—reach out and then wait for a response. What did you do in the meantime to keep the project moving forward while waiting for those replies?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:33,073", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=9 last_q='What did you do in the meantime to keep the project moving f' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:33,073", "level": "INFO", "message": "âœ… TURN 10 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:33,074", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:33,074", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:37,336", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:26:41.167 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I'll design other stuff like", "language": "en-US",
"transcript_delay": 0.03237795829772949, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:26:43.886 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.260679721832275, "max_delay": 2.0,
"min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:26:44,487", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 fragment #1: 'I'll design other stuff like...' (consolidated: 'I'll design other stuff like...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,489", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 - debounce 0.30s (is_complete=True, words=5)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,496", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=5ffbf751969d model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,718", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=5ffbf751969d payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,791", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=10 - 1 fragments  complete utterance (sentence_complete): 'I'll design other stuff like...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,792", "level": "DEBUG", "message": "Transcript: Candidate[236]: I'll design other stuff like", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,793", "level": "INFO", "message": "[EVAL_GATE] turn=10 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,793", "level": "INFO", "message": "[LIVE_N] turn=10 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:44,909", "level": "INFO", "message": "[TRANSCRIPT] Partial save 18 lines, 236s duration, 8 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1654", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:45,395", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=10 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:26:45.433 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "end to end prompting, etcetera, etcetera.", "language":
"en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:26:46,584", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-1649", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,584", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1649", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,587", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=5ffbf751969d model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,588", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=5ffbf751969d close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,590", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,593", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,597", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 already processed â€” dropping late fragment 'end to end prompting, etcetera, etcetera.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,600", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=5d20e5e5a823 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:46,830", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=5d20e5e5a823 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:48,108", "level": "WARNING", "message": "[LIVE_N] â° turn=10 | routing timeout (2.7s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1653", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:48,109", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1675", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:48,110", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1675", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:48,110", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1675", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:49,682", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That makes sense, you kept building other parts while waiting on the A P I side. Can you walk me through one specific feature or piece you designed during that time?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1685", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:49,682", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1685", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:49,987", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:54,066", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=5d20e5e5a823 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:54,073", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=5d20e5e5a823 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:54,116", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=5d20e5e5a823 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:58,524", "level": "DEBUG", "message": "Transcript: Interviewer[250]: That makes sense—you kept building other parts while waiting on the API side. Can you walk me through one specific feature or piece you designed during that time?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:58,526", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=10 last_q='Can you walk me through one specific feature or piece you de' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:58,527", "level": "INFO", "message": "âœ… TURN 11 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:58,528", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:26:58,528", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:01,576", "level": "INFO", "message": "[TIMER] remaining=947s turn=11", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:02,343", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:27:04.435 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.6764585971832275, "max_delay": 2.0,
"min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:27:06.773 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I mostly target on prompts.", "language": "en-US",
"transcript_delay": 2.8892440795898438, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:27:06,784", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 fragment #1: 'I mostly target on prompts....' (consolidated: 'I mostly target on prompts....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:06,785", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 - debounce 0.30s (is_complete=True, words=5)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:06,789", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=c7fdb57f7944 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,087", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=11 - 1 fragments  complete utterance (sentence_complete): 'I mostly target on prompts....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,088", "level": "DEBUG", "message": "Transcript: Candidate[258]: I mostly target on prompts.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,089", "level": "INFO", "message": "[EVAL_GATE] turn=11 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,089", "level": "INFO", "message": "[LIVE_N] turn=11 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,194", "level": "INFO", "message": "[TRANSCRIPT] Partial save 20 lines, 258s duration, 9 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1822", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,354", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=c7fdb57f7944 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:07,697", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=11 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:11,490", "level": "WARNING", "message": "[LIVE_N] â° turn=11 | routing timeout (3.8s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:11,492", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1804", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:11,493", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1804", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:11,493", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1804", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:13,038", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay wait, that’s actually fascinating, tell me more about the prompts you were targeting. What did those prompts do?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1815", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:13,039", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1815", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:13,340", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:16,079", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=c7fdb57f7944 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:16,079", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=c7fdb57f7944 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:16,126", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=c7fdb57f7944 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:19,663", "level": "DEBUG", "message": "Transcript: Interviewer[271]: Okay wait, that’s actually fascinating — tell me more about the prompts you were targeting. What did those prompts do?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:19,663", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=11 last_q='What did those prompts do?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:19,663", "level": "INFO", "message": "âœ… TURN 12 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:19,664", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:19,664", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:23,635", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:27:25.437 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 9.479793310165405, "max_delay": 2.0,
"min_delay": 1.1457045971870423, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:27:35,836", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:27:38.168 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "What do you mean by those prompts too?", "language":
"en-US", "transcript_delay": 0.43204307556152344, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:27:38.286 DEBUG    livekit.agents     min endpointing delay updated: 1.1457045971870423 -> 2.0
                                         {"reason": "pause between utterances", "pause": 10.911327362060547,
"max_delay": 2.0, "min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:27:39,740", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 fragment #1: 'What do you mean by those prompts too?...' (consolidated: 'What do you mean by those prompts too?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:39,741", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:39,748", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=7ba79b266778 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,045", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=12 - 1 fragments  complete utterance (sentence_complete): 'What do you mean by those prompts too?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,045", "level": "DEBUG", "message": "Transcript: Candidate[291]: What do you mean those prompts too?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,046", "level": "INFO", "message": "[EVAL_GATE] turn=12 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,046", "level": "INFO", "message": "[LIVE_N] turn=12 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,061", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=7ba79b266778 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,143", "level": "INFO", "message": "[TRANSCRIPT] Partial save 22 lines, 291s duration, 10 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1961", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:40,593", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=12 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:41,202", "level": "WARNING", "message": "[LIVE_N] â° turn=12 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-1960", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:41,204", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-1945", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:41,205", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-1945", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:41,205", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-1945", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:42,712", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Sorry, let me clarify, when you say you focused on prompts, were those prompts part of an automated messaging system or lead qualification logic? What exactly were the prompts designed to accomplish?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1956", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:42,713", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-1956", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:43,073", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:47,537", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=7ba79b266778 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:47,537", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=7ba79b266778 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:47,586", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=7ba79b266778 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:53,235", "level": "DEBUG", "message": "Transcript: Interviewer[304]: Sorry, let me clarify — when you say you focused on prompts, were those prompts part of an automated messaging system or lead qualification logic? What exactly were the prompts designed to accomplish?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:53,235", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=12 last_q='What exactly were the prompts designed to accomplish?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:53,236", "level": "INFO", "message": "âœ… TURN 13 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:53,236", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:53,237", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:56,087", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:27:57.785 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.362510681152344, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:27:59.196 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Just to qualify the criteria.", "language": "en-US",
"transcript_delay": 1.959670066833496, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:27:59,240", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 fragment #1: 'Just to qualify the criteria....' (consolidated: 'Just to qualify the criteria....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,240", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 - debounce 0.30s (is_complete=True, words=5)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,242", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=20baeb2b6ab2 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,447", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=20baeb2b6ab2 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,541", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=13 - 1 fragments  complete utterance (sentence_complete): 'Just to qualify the criteria....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,542", "level": "DEBUG", "message": "Transcript: Candidate[311]: Just to qualify the criteria.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,542", "level": "INFO", "message": "[EVAL_GATE] turn=13 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,543", "level": "INFO", "message": "[LIVE_N] turn=13 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:27:59,649", "level": "INFO", "message": "[TRANSCRIPT] Partial save 24 lines, 311s duration, 11 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2108", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:00,104", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=13 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:01,634", "level": "INFO", "message": "[TIMER] remaining=887s turn=13", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:02,702", "level": "WARNING", "message": "[LIVE_N] â° turn=13 | routing timeout (2.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2107", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:02,704", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2092", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:02,704", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2092", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:02,705", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2092", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:03,874", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, so the prompts helped qualify leads based on specific criteria. How did you decide what criteria to include in those prompts?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2103", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:03,875", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2103", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:04,228", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:07,012", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=20baeb2b6ab2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:07,013", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=20baeb2b6ab2 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:07,065", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=20baeb2b6ab2 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:11,669", "level": "DEBUG", "message": "Transcript: Interviewer[323]: Got it, so the prompts helped qualify leads based on specific criteria. How did you decide what criteria to include in those prompts?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:11,670", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=13 last_q='How did you decide what criteria to include in those prompts' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:11,670", "level": "INFO", "message": "âœ… TURN 14 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:11,671", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:11,671", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:15,235", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:28:19.726 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "The client has given us three things", "language":
"en-US", "transcript_delay": 0.08798480033874512, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:28:21.485 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 7.017297744750977, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:28:22,939", "level": "DEBUG", "message": "[STT_BUFFER] turn=14 fragment #1: 'The client has given us three things...' (consolidated: 'The client has given us three things...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:22,939", "level": "DEBUG", "message": "[STT_BUFFER] turn=14 - debounce 0.30s (is_complete=True, words=7)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:22,942", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=3c8f3b20c843 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,203", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=3c8f3b20c843 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:28:23.241 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "budget, urgency, and timeline. So based on that, we
follow.", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:28:23,247", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=14 - 1 fragments  complete utterance (sentence_complete): 'The client has given us three things...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,247", "level": "DEBUG", "message": "Transcript: Candidate[334]: The client has given us three things", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,248", "level": "INFO", "message": "[EVAL_GATE] turn=14 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,248", "level": "INFO", "message": "[LIVE_N] turn=14 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,367", "level": "INFO", "message": "[TRANSCRIPT] Partial save 26 lines, 334s duration, 12 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2246", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:23,793", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=14 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,247", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-2234", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,248", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2234", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,249", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=3c8f3b20c843 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,249", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=3c8f3b20c843 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,250", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,250", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,255", "level": "DEBUG", "message": "[STT_BUFFER] turn=14 already processed â€” dropping late fragment 'budget, urgency, and timeline. So based on that, we follow.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1949, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,258", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=dca1c6934523 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,471", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=dca1c6934523 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,895", "level": "WARNING", "message": "[LIVE_N] â° turn=14 | routing timeout (2.1s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2240", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,896", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2262", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,897", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2262", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:25,897", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2262", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:27,762", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That makes sense, using budget, urgency, and timeline as key qualifiers is a practical choice. How did you actually implement those criteria in the system, was it rulesbased, or did you use some kind of scoring or automation?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2272", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:27,763", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2272", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:28,036", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:34,413", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=dca1c6934523 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:34,413", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=dca1c6934523 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:34,453", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=dca1c6934523 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:42,200", "level": "DEBUG", "message": "Transcript: Interviewer[353]: That makes sense, using budget, urgency, and timeline as key qualifiers is a practical choice. How did you actually implement those criteria in the system—was it rules-based, or did you use some kind of scoring or automation?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:42,200", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=14 last_q='How did you actually implement those criteria in the system—' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:42,201", "level": "INFO", "message": "âœ… TURN 15 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:42,202", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:42,202", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:43,985", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:28:45.386 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 7.125652551651001, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:28:48.280 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. It's rule based.", "language": "en-US",
"transcript_delay": 3.4444615840911865, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:28:48,290", "level": "DEBUG", "message": "[STT_BUFFER] turn=15 fragment #1: 'No. It's rule based....' (consolidated: 'No. It's rule based....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,291", "level": "DEBUG", "message": "[STT_BUFFER] turn=15 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,293", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=3ceeed854175 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,544", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=3ceeed854175 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,593", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=15 - 1 fragments  complete utterance (sentence_complete): 'No. It's rule based....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,594", "level": "DEBUG", "message": "Transcript: Candidate[360]: No. It's rule based.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,594", "level": "INFO", "message": "[EVAL_GATE] turn=15 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,595", "level": "INFO", "message": "[LIVE_N] turn=15 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:48,712", "level": "INFO", "message": "[TRANSCRIPT] Partial save 28 lines, 360s duration, 13 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2430", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:49,196", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=15 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:49,800", "level": "WARNING", "message": "[LIVE_N] â° turn=15 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2429", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:49,801", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2412", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:49,801", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2412", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:49,802", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2412", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:51,111", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Right, right, a rulebased system fits well for clearcut criteria like those. Can you give me a specific example of one rule you created to qualify a lead?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2423", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:51,111", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2423", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:51,475", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:56,320", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=3ceeed854175 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:56,320", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=3ceeed854175 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:28:56,385", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=3ceeed854175 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:01,697", "level": "INFO", "message": "[TIMER] remaining=827s turn=15", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:02,499", "level": "DEBUG", "message": "Transcript: Interviewer[374]: Right, right—a rule-based system fits well for clear-cut criteria like those. Can you give me a specific example of one rule you created to qualify a lead?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:02,501", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=15 last_q='Can you give me a specific example of one rule you created t' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:02,502", "level": "INFO", "message": "âœ… TURN 16 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:02,503", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:02,503", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:04,036", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:29:05.436 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.6637725830078125, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:29:08.140 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. I don't know.", "language": "en-US",
"transcript_delay": 3.2555816173553467, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:29:08,149", "level": "DEBUG", "message": "[STT_BUFFER] turn=16 fragment #1: 'No. I don't know....' (consolidated: 'No. I don't know....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,149", "level": "DEBUG", "message": "[STT_BUFFER] turn=16 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,152", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=cd0f4f207f73 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,409", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=cd0f4f207f73 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,451", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=16 - 1 fragments  complete utterance (sentence_complete): 'No. I don't know....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,452", "level": "DEBUG", "message": "Transcript: Candidate[380]: No. I don't know.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,452", "level": "INFO", "message": "[EVAL_GATE] turn=16 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,453", "level": "INFO", "message": "[LIVE_N] turn=16 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:08,568", "level": "INFO", "message": "[TRANSCRIPT] Partial save 30 lines, 380s duration, 14 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2566", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:09,094", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=16 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:09,695", "level": "WARNING", "message": "[LIVE_N] â° turn=16 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2565", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:09,696", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2546", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:09,696", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2546", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:09,697", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2546", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:10,999", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I appreciate that, thanks for being straight with me. Let’s move on, tell me about your Sensex Analysis Project and what part you worked on.'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2557", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:11,000", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2557", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:11,357", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:14,291", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=cd0f4f207f73 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:14,292", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=cd0f4f207f73 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:14,332", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=cd0f4f207f73 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:18,177", "level": "DEBUG", "message": "Transcript: Interviewer[389]: I appreciate that, thanks for being straight with me. Let’s move on—tell me about your Sensex Analysis Project and what part you worked on.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:18,177", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=16 last_q='Let’s move on—tell me about your Sensex Analysis Project and' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:18,178", "level": "INFO", "message": "âœ… TURN 17 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:18,178", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:18,179", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:22,137", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:29:22.836 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.49620246887207, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:29:23,137", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:29:24.736 DEBUG    livekit.agents     min endpointing delay updated: 2.0 -> 1.8812370777130127
                                         {"reason": "pause between utterances", "pause": 0.812370777130127, "max_delay":
2.0, "min_delay": 1.8812370777130127, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:29:28.223 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Didn't work on anything.", "language": "en-US",
"transcript_delay": 4.03768253326416, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:29:28,232", "level": "DEBUG", "message": "[STT_BUFFER] turn=17 fragment #1: 'Didn't work on anything....' (consolidated: 'Didn't work on anything....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,232", "level": "DEBUG", "message": "[STT_BUFFER] turn=17 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,234", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=7ae6f1c0dced model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,470", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=7ae6f1c0dced payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,534", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=17 - 1 fragments  complete utterance (sentence_complete): 'Didn't work on anything....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,535", "level": "DEBUG", "message": "Transcript: Candidate[400]: Didn't work on anything.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,535", "level": "INFO", "message": "[EVAL_GATE] turn=17 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,536", "level": "INFO", "message": "[LIVE_N] turn=17 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:28,644", "level": "INFO", "message": "[TRANSCRIPT] Partial save 32 lines, 400s duration, 15 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:29,091", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=17 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:29,695", "level": "WARNING", "message": "[LIVE_N] â° turn=17 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2696", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:29,696", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2678", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:29,697", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2678", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:29,701", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2678", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:30,778", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for being honest about that. What about the Campaign Metrics and Slack Reporting System, what part of that did you build or contribute to?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2689", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:30,778", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2689", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:31,126", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:34,872", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=7ae6f1c0dced model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:34,873", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=7ae6f1c0dced model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:34,924", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=7ae6f1c0dced close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:39,590", "level": "DEBUG", "message": "Transcript: Interviewer[411]: Thanks for being honest about that. What about the Campaign Metrics and Slack Reporting System—what part of that did you build or contribute to?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:39,591", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=17 last_q='What about the Campaign Metrics and Slack Reporting System—w' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:39,591", "level": "INFO", "message": "âœ… TURN 18 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:39,592", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:39,592", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:41,436", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:29:42.335 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.965513467788696, "max_delay": 2.0,
"min_delay": 1.8812370777130127, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:29:43.280 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I don't know.", "language": "en-US", "transcript_delay":
1.4954352378845215, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:29:43,669", "level": "DEBUG", "message": "[STT_BUFFER] turn=18 fragment #1: 'I don't know....' (consolidated: 'I don't know....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,670", "level": "DEBUG", "message": "[STT_BUFFER] turn=18 - debounce 0.30s (is_complete=True, words=3)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,676", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=e6963deb8840 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,893", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=e6963deb8840 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,971", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=18 - 1 fragments  complete utterance (sentence_complete): 'I don't know....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,972", "level": "DEBUG", "message": "Transcript: Candidate[415]: I don't know.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,972", "level": "INFO", "message": "[EVAL_GATE] turn=18 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:43,973", "level": "INFO", "message": "[LIVE_N] turn=18 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:44,085", "level": "INFO", "message": "[TRANSCRIPT] Partial save 34 lines, 415s duration, 16 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:44,590", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=18 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:45,205", "level": "WARNING", "message": "[LIVE_N] â° turn=18 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:45,206", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:45,207", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:45,208", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:46,259", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, I appreciate the honesty. Let’s shift a bit, what kind of work do you most enjoy doing daytoday in your current or past roles?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2816", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:46,259", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2816", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:46,668", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:50,875", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=e6963deb8840 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:50,876", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=e6963deb8840 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:50,925", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=e6963deb8840 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:55,446", "level": "DEBUG", "message": "Transcript: Interviewer[427]: Okay, I appreciate the honesty. Let’s shift a bit—what kind of work do you most enjoy doing day-to-day in your current or past roles?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:55,446", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=18 last_q='Let’s shift a bit—what kind of work do you most enjoy doing ' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:55,446", "level": "INFO", "message": "âœ… TURN 19 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:55,447", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:55,448", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:29:58,937", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:30:00.286 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.908620834350586, "max_delay": 2.0,
"min_delay": 1.8812370777130127, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:30:01.178 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I can't answer.", "language": "en-US", "transcript_delay":
1.4444952011108398, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:30:01,619", "level": "DEBUG", "message": "[STT_BUFFER] turn=19 fragment #1: 'I can't answer....' (consolidated: 'I can't answer....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,619", "level": "DEBUG", "message": "[STT_BUFFER] turn=19 - debounce 0.30s (is_complete=True, words=3)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,622", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=ab6d49d01bfa model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,755", "level": "INFO", "message": "[TIMER] remaining=767s turn=19", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,847", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=ab6d49d01bfa payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,921", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=19 - 1 fragments  complete utterance (sentence_complete): 'I can't answer....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,921", "level": "DEBUG", "message": "Transcript: Candidate[433]: I can't answer.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,922", "level": "INFO", "message": "[EVAL_GATE] turn=19 â†’ PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1367, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:01,922", "level": "INFO", "message": "[LIVE_N] turn=19 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1562, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:02,029", "level": "INFO", "message": "[TRANSCRIPT] Partial save 36 lines, 433s duration, 17 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2948", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:02,499", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=19 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1533, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:03,097", "level": "WARNING", "message": "[LIVE_N] â° turn=19 | routing timeout (0.6s) â€” releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1799, "taskName": "Task-2947", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:03,098", "level": "INFO", "message": "[LLM_GATE] âœ… directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-2932", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:03,098", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-2932", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:03,099", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-2932", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:04,113", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, no worries. What are you learning or building right now outside of work?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2943", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:04,114", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-2943", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:04,484", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:06,779", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=ab6d49d01bfa model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:06,780", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=ab6d49d01bfa model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:06,825", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=ab6d49d01bfa close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:09,945", "level": "DEBUG", "message": "Transcript: Interviewer[441]: Got it, no worries. What are you learning or building right now outside of work?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:09,945", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=19 last_q='What are you learning or building right now outside of work?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:09,946", "level": "INFO", "message": "âœ… TURN 20 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:09,947", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:09,948", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:12,036", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:30:12.785 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 4.773291110992432, "max_delay": 2.0,
"min_delay": 1.8812370777130127, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:30:15.869 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Nothing.", "language": "en-US", "transcript_delay":
3.634322166442871, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:30:15,876", "level": "DEBUG", "message": "[STT_BUFFER] turn=20 fragment #1: 'Nothing....' (consolidated: 'Nothing....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:15,878", "level": "DEBUG", "message": "[STT_BUFFER] turn=20 - debounce 4.00s (is_complete=False, words=1)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:15,880", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=f90561cae94a model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:15,937", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:16,121", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=f90561cae94a payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:30:16.885 DEBUG    livekit.agents     min endpointing delay updated: 1.8812370777130127 -> 2.0
                                         {"reason": "pause between utterances", "pause": 3.663799524307251, "max_delay":
2.0, "min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    17:30:19.715 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Nothing.", "language": "en-US", "transcript_delay":
3.3805394172668457, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:30:19,880", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=20 - 1 fragments  complete utterance (debounce_timeout): 'Nothing....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-3065", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:19,881", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (1 words): 'Nothing.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1272, "taskName": "Task-3065", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:31,276", "level": "WARNING", "message": "[LLM_GATE] â° timed out (15s) â€” generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 277, "taskName": "Task-3035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:31,277", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-3035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:31,278", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-3035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:32,662", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, fair enough. If you could pick one area to grow in over the next year, what would that be?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3046", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:32,662", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-3046", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:33,019", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:35,951", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=f90561cae94a model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:35,951", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=f90561cae94a model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:36,008", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=f90561cae94a close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:40,047", "level": "DEBUG", "message": "Transcript: Interviewer[471]: Okay, fair enough. If you could pick one area to grow in over the next year, what would that be?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:40,047", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=20 last_q='If you could pick one area to grow in over the next year, wh' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:40,047", "level": "INFO", "message": "âœ… TURN 21 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:40,048", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:40,048", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:41,787", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:30:42.688 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 16.708869218826294, "max_delay": 2.0,
"min_delay": 2.0, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:30:44,139", "level": "DEBUG", "message": "[STT_BUFFER] turn=21 fragment #1: 'Nothing....' (consolidated: 'Nothing....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1967, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:44,140", "level": "DEBUG", "message": "[STT_BUFFER] turn=21 - debounce 4.00s (is_complete=False, words=1)", "logger": "interview-agent", "module": "agent_runtime", "line": 2054, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:44,146", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=7a72601c503b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:44,347", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=7a72601c503b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:48,144", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=21 - 1 fragments  complete utterance (debounce_timeout): 'Nothing....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2000, "taskName": "Task-3186", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:48,145", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (1 words): 'Nothing.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1272, "taskName": "Task-3186", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:59,541", "level": "WARNING", "message": "[LLM_GATE] â° timed out (15s) â€” generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 277, "taskName": "Task-3167", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:59,542", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 305, "taskName": "Task-3167", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:30:59,542", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 314, "taskName": "Task-3167", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:01,018", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Alright, thanks for sharing that. What drew you to this G TM engineer role at Vamsi?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-3178", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:01,019", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 363, "taskName": "Task-3178", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:01,371", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2095, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:01,807", "level": "INFO", "message": "[TIMER] remaining=707s turn=21", "logger": "interview-agent", "module": "agent_runtime", "line": 2313, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:03,395", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=7a72601c503b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:03,396", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=7a72601c503b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:03,446", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=7a72601c503b close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:06,387", "level": "DEBUG", "message": "Transcript: Interviewer[498]: Alright, thanks for sharing that. What drew you to this GTM engineer role at Vamsi?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:06,387", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=21 last_q='What drew you to this GTM engineer role at Vamsi?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1867, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:06,388", "level": "INFO", "message": "âœ… TURN 22 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1916, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:06,388", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2093, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:06,389", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2115, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 17:31:11,328", "level": "INFO", "message": "Candidate participant disconnected", "logger": "interview-agent", "module": "agent_runtime", "line": 1090, "taskName": "Task-33", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    17:31:11.332 DEBUG    livekit.agents     stream closed
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmps7cu-8541", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 17:31:16,849", "level": "INFO", "message": "Interview ended (finished=False, time_expired=Fal

Worker:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python -m interview.eval_worker
17:15:13 [INFO] eval_worker: [WORKER] Started — redis=redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768 queue=interview:eval_queue
17:23:43 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:23:43 [INFO] eval_worker: ✅ TURN 3 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:23:43 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:23:43 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:23:43 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=3
17:23:43 [INFO] eval_worker: [TURN] INTERVIEW | turn=3 | scoring_topic=? | covered=none | remaining=1145s | mode=normal | saturation=0% (0.0/4.0)
17:23:43 [INFO] eval_worker: [QA] turn=3  Q: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM engineer role. How are you doing? Hope the day's been good to you. Ha, good!
              A: The other part is integrating API. And, also,
17:23:43 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:23:43,617", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=8 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-2"}
17:23:47 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:23:47,321", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason='The other part is integrating API'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-2"}
17:23:47 [INFO] eval_worker: [QUALITY] turn=3 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
17:23:47 [INFO] eval_worker: [EVAL] turn=3 action=PROBE mode=depth quality_avg=1.50 signals=[none]
17:23:47 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:23:47 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:23:47 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:23:47 [INFO] eval_worker: [SATURATION] turn=3 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:23:47 [INFO] eval_worker: [DECISION] turn=3 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:23:47 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[none] sat=25% turn=3
17:23:47 [INFO] eval_worker: [RESULT] turn=3  action=PROBE     quality=1.50/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:23:47 [INFO] eval_worker: [E2E_VERIFY] turn=3 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:23:47 [INFO] eval_worker: [WORKER] ✅ turn=3 action=PROBE overall=1.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (3896ms)
17:23:47 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:23:47 [INFO] eval_worker: ✅ TURN 3 DONE
17:23:47 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:10 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:10 [INFO] eval_worker: ✅ TURN 4 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:24:10 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:10 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:24:10 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=4
17:24:10 [INFO] eval_worker: [TURN] INTERVIEW | turn=4 | scoring_topic=? | covered=none | remaining=1118s | mode=normal | saturation=0% (0.0/4.0)
17:24:10 [INFO] eval_worker: [QA] turn=4  Q: Okay, integrating APIs can definitely be tricky. Can you give me a specific example of one API integration that was challenging and how you handled it?
              A: training prompt. So the main thing is meta API because we need a lot of approvals for that.
17:24:10 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:24:10,999", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=18 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-14"}
17:24:13 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:24:13,453", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=3 depth=2 specificity=3 grounding=2 | reason='main thing is meta API because we need a lot'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-14"}
17:24:13 [INFO] eval_worker: [QUALITY] turn=4 | clarity=3.0 depth=2.0 specificity=3.0 grounding=2.0 | avg=2.50 weighted=2.50 depth_signal=SURFACE
17:24:13 [INFO] eval_worker: [EVAL] turn=4 action=PROBE mode=depth quality_avg=2.50 signals=[example_evasion]
17:24:13 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.68 delta=-0.15 turn=4
17:24:13 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.50 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:24:13 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:24:13 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:24:13 [INFO] eval_worker: [SATURATION] turn=4 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[example_evasion]
17:24:13 [INFO] eval_worker: [DECISION] turn=4 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:24:13 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[example_evasion] sat=25% turn=4
17:24:13 [INFO] eval_worker: [RESULT] turn=4  action=PROBE     quality=2.50/SURFACE  signals=[example_evasion]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:24:13 [INFO] eval_worker: [E2E_VERIFY] turn=4 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:24:13 [INFO] eval_worker: [WORKER] ✅ turn=4 action=PROBE overall=2.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2699ms)
17:24:13 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:13 [INFO] eval_worker: ✅ TURN 4 DONE
17:24:13 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:43 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:43 [INFO] eval_worker: ✅ TURN 5 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:24:43 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:43 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:24:43 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=5
17:24:43 [INFO] eval_worker: [TURN] INTERVIEW | turn=5 | scoring_topic=? | covered=none | remaining=1085s | mode=normal | saturation=0% (0.0/4.0)
17:24:43 [INFO] eval_worker: [QA] turn=5  Q: Got it, dealing with Meta’s API approval process sounds frustrating. How did you work around those approval challenges while building the lead capture system?
              A: Like, you know, whenever it's something that is he may have to contact Meta, then after then we'll get to know their customer support.
17:24:44 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:24:44,001", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=24 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-26"}
17:24:45 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:24:45,769", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=2 specificity=2 grounding=2 | reason='he may have to contact Meta, then after then'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-26"}
17:24:45 [INFO] eval_worker: [QUALITY] turn=5 | clarity=3.0 depth=2.0 specificity=2.0 grounding=2.0 | avg=2.25 weighted=2.20 depth_signal=SURFACE
17:24:45 [INFO] eval_worker: [EVAL] turn=5 action=PROBE mode=clarification quality_avg=2.25 signals=[none]
17:24:45 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:24:45 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:24:45 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:24:45 [INFO] eval_worker: [SATURATION] turn=5 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:24:45 [INFO] eval_worker: [DECISION] turn=5 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:24:45 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=5
17:24:45 [INFO] eval_worker: [RESULT] turn=5  action=PROBE     quality=2.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:24:45 [INFO] eval_worker: [E2E_VERIFY] turn=5 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:24:46 [INFO] eval_worker: [WORKER] ✅ turn=5 action=PROBE overall=2.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2001ms)
17:24:46 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:24:46 [INFO] eval_worker: ✅ TURN 5 DONE
17:24:46 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:08 [INFO] eval_worker: ✅ TURN 6 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:25:08 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:08 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:25:08 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=6
17:25:08 [INFO] eval_worker: [TURN] INTERVIEW | turn=6 | scoring_topic=? | covered=none | remaining=1060s | mode=normal | saturation=0% (0.0/4.0)
17:25:08 [INFO] eval_worker: [QA] turn=6  Q: That makes sense—so you had to weigh the tradeoff between waiting for Meta’s support versus switching to a different API. How did you decide when to stick with Meta and when to switch?
              A: There's nothing. If meta doesn't work, then we'll switch to other API.
17:25:08 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:25:08,999", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=12 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-38"}
17:25:10 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:25:10,642", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=4 depth=1 specificity=1 grounding=2 | reason=\"If meta doesn't work, then we'll switch\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-38"}
17:25:10 [INFO] eval_worker: [QUALITY] turn=6 | clarity=4.0 depth=1.0 specificity=1.0 grounding=2.0 | avg=2.00 weighted=1.75 depth_signal=SURFACE
17:25:10 [INFO] eval_worker: [EVAL] turn=6 action=PROBE mode=depth quality_avg=2.00 signals=[none]
17:25:10 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.75 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:25:10 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:25:10 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:25:10 [INFO] eval_worker: [SATURATION] turn=6 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:25:10 [INFO] eval_worker: [DECISION] turn=6 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:25:10 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[none] sat=25% turn=6
17:25:10 [INFO] eval_worker: [RESULT] turn=6  action=PROBE     quality=2.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:25:10 [INFO] eval_worker: [E2E_VERIFY] turn=6 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:25:10 [INFO] eval_worker: [WORKER] ✅ turn=6 action=PROBE overall=2.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1799ms)
17:25:10 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:10 [INFO] eval_worker: ✅ TURN 6 DONE
17:25:10 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:32 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:32 [INFO] eval_worker: ✅ TURN 7 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:25:32 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:32 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:25:32 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=7
17:25:32 [INFO] eval_worker: [TURN] INTERVIEW | turn=7 | scoring_topic=? | covered=none | remaining=1037s | mode=normal | saturation=0% (0.0/4.0)
17:25:32 [INFO] eval_worker: [QA] turn=7  Q: Okay, so it was more of a fallback plan—stick with Meta if it works, otherwise switch to an alternative. What was the alternative API you considered or used in case Meta wasn’t an option?
              A: Then we what we'll do, there is no alternative. We have to talk to Meta team itself.
17:25:32 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:25:32,100", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=17 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-50"}
17:25:33 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:25:33,682", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=5 depth=2 specificity=1 grounding=2 | reason=\"Then we what we'll do, there is no alternative\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-50"}
17:25:33 [INFO] eval_worker: [QUALITY] turn=7 | clarity=5.0 depth=2.0 specificity=1.0 grounding=2.0 | avg=2.50 weighted=2.30 depth_signal=SURFACE
17:25:33 [INFO] eval_worker: [EVAL] turn=7 action=PROBE mode=clarification quality_avg=2.50 signals=[ownership_ambiguity]
17:25:33 [INFO] eval_worker: [SIGNAL] name=ownership_ambiguity          layer=behavioral_confidence confidence=0.75 delta=-0.15 turn=7
17:25:33 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.30 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:25:33 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:25:33 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:25:33 [INFO] eval_worker: [SATURATION] turn=7 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[ownership_ambiguity]
17:25:33 [INFO] eval_worker: [DECISION] turn=7 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:25:33 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[ownership_ambiguity] sat=25% turn=7
17:25:33 [INFO] eval_worker: [RESULT] turn=7  action=PROBE     quality=2.50/SURFACE  signals=[ownership_ambiguity]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:25:33 [INFO] eval_worker: [E2E_VERIFY] turn=7 | PIPELINE_OUTPUT:
  signals_fired    : ['ownership_ambiguity']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:25:33 [INFO] eval_worker: [WORKER] ✅ turn=7 action=PROBE overall=2.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1799ms)
17:25:33 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:33 [INFO] eval_worker: ✅ TURN 7 DONE
17:25:33 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:53 [INFO] eval_worker: ✅ TURN 8 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:25:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:53 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:25:53 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=8
17:25:53 [INFO] eval_worker: [TURN] INTERVIEW | turn=8 | scoring_topic=? | covered=none | remaining=1016s | mode=normal | saturation=0% (0.0/4.0)
17:25:53 [INFO] eval_worker: [QA] turn=8  Q: I appreciate that, thanks for being straight with me. So reaching out directly to the Meta team was essential. How did you coordinate or manage that communication? Was it just you, or did you have a t
              A: No. It's just me.
17:25:53 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:25:53 [INFO] eval_worker: [QUALITY] turn=8 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:25:53 [INFO] eval_worker: [EVAL] turn=8 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
17:25:53 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:25:53 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:25:53 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:25:53 [INFO] eval_worker: [SATURATION] turn=8 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:25:53 [INFO] eval_worker: [DECISION] turn=8 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:25:53 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[none] sat=25% turn=8
17:25:53 [INFO] eval_worker: [RESULT] turn=8  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:25:53 [INFO] eval_worker: [E2E_VERIFY] turn=8 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:25:53 [INFO] eval_worker: [WORKER] ✅ turn=8 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (201ms)
17:25:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:25:53 [INFO] eval_worker: ✅ TURN 8 DONE
17:25:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:18 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:18 [INFO] eval_worker: ✅ TURN 9 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:26:18 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:18 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:26:18 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=9
17:26:18 [INFO] eval_worker: [TURN] INTERVIEW | turn=9 | scoring_topic=? | covered=none | remaining=991s | mode=normal | saturation=0% (0.0/4.0)
17:26:18 [INFO] eval_worker: [QA] turn=9  Q: That's actually a smart call—handling that communication solo takes initiative. How did you keep track of the conversations and any action items during that process?
              A: No. Not like that. I will just contact with the
17:26:18 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:26:18,401", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=10 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-74"}
17:26:20 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:26:20,032", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason='No. Not like that. I will just contact with the'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-74"}
17:26:20 [INFO] eval_worker: [QUALITY] turn=9 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
17:26:20 [INFO] eval_worker: [EVAL] turn=9 action=PROBE mode=clarification quality_avg=1.50 signals=[none]
17:26:20 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:26:20 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:26:20 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:26:20 [INFO] eval_worker: [SATURATION] turn=9 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:26:20 [INFO] eval_worker: [DECISION] turn=9 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:26:20 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=9
17:26:20 [INFO] eval_worker: [RESULT] turn=9  action=PROBE     quality=1.50/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:26:20 [INFO] eval_worker: [E2E_VERIFY] turn=9 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:26:20 [INFO] eval_worker: [WORKER] ✅ turn=9 action=PROBE overall=1.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1800ms)
17:26:20 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:20 [INFO] eval_worker: ✅ TURN 9 DONE
17:26:20 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:45 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:45 [INFO] eval_worker: ✅ TURN 10 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:26:45 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:45 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:26:45 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=10
17:26:45 [INFO] eval_worker: [TURN] INTERVIEW | turn=10 | scoring_topic=? | covered=none | remaining=964s | mode=normal | saturation=0% (0.0/4.0)
17:26:45 [INFO] eval_worker: [QA] turn=10  Q: Got it, so it was more reactive—reach out and then wait for a response. What did you do in the meantime to keep the project moving forward while waiting for those replies?
              A: I'll design other stuff like
17:26:45 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:26:45,499", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=5 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-86"}
17:26:47 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:26:47,604", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=3 depth=2 specificity=1 grounding=2 | reason=\"I'll design other stuff like\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-86"}
17:26:47 [INFO] eval_worker: [QUALITY] turn=10 | clarity=3.0 depth=2.0 specificity=1.0 grounding=2.0 | avg=2.00 weighted=1.90 depth_signal=SURFACE
17:26:47 [INFO] eval_worker: [EVAL] turn=10 action=PROBE mode=depth quality_avg=2.00 signals=[none]
17:26:47 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.90 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:26:47 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:26:47 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:26:47 [INFO] eval_worker: [SATURATION] turn=10 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:26:47 [INFO] eval_worker: [DECISION] turn=10 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:26:47 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[none] sat=25% turn=10
17:26:47 [INFO] eval_worker: [RESULT] turn=10  action=PROBE     quality=2.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:26:47 [INFO] eval_worker: [E2E_VERIFY] turn=10 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:26:47 [INFO] eval_worker: [WORKER] ✅ turn=10 action=PROBE overall=2.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2310ms)
17:26:47 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:26:47 [INFO] eval_worker: ✅ TURN 10 DONE
17:26:47 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:07 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:07 [INFO] eval_worker: ✅ TURN 11 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:27:07 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:07 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:27:07 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=11
17:27:07 [INFO] eval_worker: [TURN] INTERVIEW | turn=11 | scoring_topic=? | covered=none | remaining=941s | mode=normal | saturation=0% (0.0/4.0)
17:27:07 [INFO] eval_worker: [QA] turn=11  Q: That makes sense—you kept building other parts while waiting on the API side. Can you walk me through one specific feature or piece you designed during that time?
              A: I mostly target on prompts.
17:27:07 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:27:07,803", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=5 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-98"}
17:27:10 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:27:11,000", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason='I mostly target on prompts'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-98"}
17:27:11 [INFO] eval_worker: [QUALITY] turn=11 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
17:27:11 [INFO] eval_worker: [EVAL] turn=11 action=PROBE mode=clarification quality_avg=1.50 signals=[example_evasion]
17:27:11 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=11
17:27:11 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:27:11 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:27:11 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:27:11 [INFO] eval_worker: [SATURATION] turn=11 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[example_evasion]
17:27:11 [INFO] eval_worker: [DECISION] turn=11 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:27:11 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[example_evasion] sat=25% turn=11
17:27:11 [INFO] eval_worker: [RESULT] turn=11  action=PROBE     quality=1.50/SURFACE  signals=[example_evasion]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:27:11 [INFO] eval_worker: [E2E_VERIFY] turn=11 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:27:11 [INFO] eval_worker: [WORKER] ✅ turn=11 action=PROBE overall=1.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (3394ms)
17:27:11 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:11 [INFO] eval_worker: ✅ TURN 11 DONE
17:27:11 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:40 [INFO] eval_worker: ✅ TURN 12 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:27:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:40 [INFO] eval_worker: [EVAL_PIPELINE] Clarification/connection detected (class=clarification_question, text='What do you mean those prompts too?') — injecting REPHRASE directive turn=12 (post_moveon=False)
17:27:40 [INFO] eval_worker: [WORKER] ✅ turn=12 action=REPHRASE overall=0.00 sat=0.0/0.0 topic=None→None (205ms)
17:27:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:27:40 [INFO] eval_worker: ✅ TURN 12 DONE
17:27:40 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:00 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:00 [INFO] eval_worker: ✅ TURN 13 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:28:00 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:00 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:28:00 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=13
17:28:00 [INFO] eval_worker: [TURN] INTERVIEW | turn=13 | scoring_topic=? | covered=none | remaining=889s | mode=normal | saturation=0% (0.0/4.0)
17:28:00 [INFO] eval_worker: [QA] turn=13  Q: Sorry, let me clarify — when you say you focused on prompts, were those prompts part of an automated messaging system or lead qualification logic? What exactly were the prompts designed to accomplish?
              A: Just to qualify the criteria.
17:28:00 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:28:00,197", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=5 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-110"}
17:28:02 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:28:02,153", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason='Just to qualify the criteria'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-110"}
17:28:02 [INFO] eval_worker: [QUALITY] turn=13 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
17:28:02 [INFO] eval_worker: [EVAL] turn=13 action=PROBE mode=depth quality_avg=1.50 signals=[none]
17:28:02 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:28:02 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:28:02 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:28:02 [INFO] eval_worker: [SATURATION] turn=13 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:28:02 [INFO] eval_worker: [DECISION] turn=13 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:28:02 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[none] sat=25% turn=13
17:28:02 [INFO] eval_worker: [RESULT] turn=13  action=PROBE     quality=1.50/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:28:02 [INFO] eval_worker: [E2E_VERIFY] turn=13 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:28:02 [INFO] eval_worker: [WORKER] ✅ turn=13 action=PROBE overall=1.50 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2206ms)
17:28:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:02 [INFO] eval_worker: ✅ TURN 13 DONE
17:28:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:23 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:23 [INFO] eval_worker: ✅ TURN 14 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:28:23 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:23 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:28:23 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=14
17:28:23 [INFO] eval_worker: [TURN] INTERVIEW | turn=14 | scoring_topic=? | covered=none | remaining=865s | mode=normal | saturation=0% (0.0/4.0)
17:28:23 [INFO] eval_worker: [QA] turn=14  Q: Got it, so the prompts helped qualify leads based on specific criteria. How did you decide what criteria to include in those prompts?
              A: The client has given us three things
17:28:23 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 17:28:23,896", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=7 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-122"}
17:28:25 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 17:28:25,353", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=2 | reason='The client has given us three things'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-122"}
17:28:25 [INFO] eval_worker: [QUALITY] turn=14 | clarity=3.0 depth=1.0 specificity=1.0 grounding=2.0 | avg=1.75 weighted=1.55 depth_signal=SURFACE
17:28:25 [INFO] eval_worker: [EVAL] turn=14 action=PROBE mode=depth quality_avg=1.75 signals=[ownership_ambiguity]
17:28:25 [INFO] eval_worker: [SIGNAL] name=ownership_ambiguity          layer=behavioral_confidence confidence=0.72 delta=-0.15 turn=14
17:28:25 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.55 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:28:25 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:28:25 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:28:25 [INFO] eval_worker: [SATURATION] turn=14 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[ownership_ambiguity]
17:28:25 [INFO] eval_worker: [DECISION] turn=14 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:28:25 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[ownership_ambiguity] sat=25% turn=14
17:28:25 [INFO] eval_worker: [RESULT] turn=14  action=PROBE     quality=1.75/SURFACE  signals=[ownership_ambiguity]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:28:25 [INFO] eval_worker: [E2E_VERIFY] turn=14 | PIPELINE_OUTPUT:
  signals_fired    : ['ownership_ambiguity']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:28:25 [INFO] eval_worker: [WORKER] ✅ turn=14 action=PROBE overall=1.75 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1700ms)
17:28:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:25 [INFO] eval_worker: ✅ TURN 14 DONE
17:28:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:49 [INFO] eval_worker: ✅ TURN 15 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:28:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:49 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:28:49 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=15
17:28:49 [INFO] eval_worker: [TURN] INTERVIEW | turn=15 | scoring_topic=? | covered=none | remaining=840s | mode=normal | saturation=0% (0.0/4.0)
17:28:49 [INFO] eval_worker: [QA] turn=15  Q: That makes sense, using budget, urgency, and timeline as key qualifiers is a practical choice. How did you actually implement those criteria in the system—was it rules-based, or did you use some kind
              A: No. It's rule based.
17:28:49 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:28:49 [INFO] eval_worker: [QUALITY] turn=15 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:28:49 [INFO] eval_worker: [EVAL] turn=15 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
17:28:49 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:28:49 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:28:49 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:28:49 [INFO] eval_worker: [SATURATION] turn=15 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:28:49 [INFO] eval_worker: [DECISION] turn=15 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:28:49 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[none] sat=25% turn=15
17:28:49 [INFO] eval_worker: [RESULT] turn=15  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:28:49 [INFO] eval_worker: [E2E_VERIFY] turn=15 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:28:49 [INFO] eval_worker: [WORKER] ✅ turn=15 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (203ms)
17:28:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:28:49 [INFO] eval_worker: ✅ TURN 15 DONE
17:28:49 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:09 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:09 [INFO] eval_worker: ✅ TURN 16 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:29:09 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:09 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:29:09 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=16
17:29:09 [INFO] eval_worker: [TURN] INTERVIEW | turn=16 | scoring_topic=? | covered=none | remaining=820s | mode=normal | saturation=0% (0.0/4.0)
17:29:09 [INFO] eval_worker: [QA] turn=16  Q: Right, right—a rule-based system fits well for clear-cut criteria like those. Can you give me a specific example of one rule you created to qualify a lead?
              A: No. I don't know.
17:29:09 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:29:09 [INFO] eval_worker: [QUALITY] turn=16 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:29:09 [INFO] eval_worker: [EVAL] turn=16 action=PROBE mode=ownership quality_avg=0.25 signals=[example_evasion]
17:29:09 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=16
17:29:09 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:29:09 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:29:09 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:29:09 [INFO] eval_worker: [SATURATION] turn=16 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[example_evasion]
17:29:09 [INFO] eval_worker: [DECISION] turn=16 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:29:09 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[example_evasion] sat=25% turn=16
17:29:09 [INFO] eval_worker: [RESULT] turn=16  action=PROBE     quality=0.25/SURFACE  signals=[example_evasion]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:29:09 [INFO] eval_worker: [E2E_VERIFY] turn=16 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:29:09 [INFO] eval_worker: [WORKER] ✅ turn=16 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (191ms)
17:29:09 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:09 [INFO] eval_worker: ✅ TURN 16 DONE
17:29:09 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:29 [INFO] eval_worker: ✅ TURN 17 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:29:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:29 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:29:29 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=17
17:29:29 [INFO] eval_worker: [TURN] INTERVIEW | turn=17 | scoring_topic=? | covered=none | remaining=800s | mode=normal | saturation=0% (0.0/4.0)
17:29:29 [INFO] eval_worker: [QA] turn=17  Q: I appreciate that, thanks for being straight with me. Let’s move on—tell me about your Sensex Analysis Project and what part you worked on.
              A: Didn't work on anything.
17:29:29 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:29:29 [INFO] eval_worker: [QUALITY] turn=17 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:29:29 [INFO] eval_worker: [EVAL] turn=17 action=PROBE mode=ownership quality_avg=0.25 signals=[example_evasion]
17:29:29 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=17
17:29:29 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
17:29:29 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:29:29 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:29:29 [INFO] eval_worker: [SATURATION] turn=17 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[example_evasion]
17:29:29 [INFO] eval_worker: [DECISION] turn=17 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:29:29 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[example_evasion] sat=25% turn=17
17:29:29 [INFO] eval_worker: [RESULT] turn=17  action=PROBE     quality=0.25/SURFACE  signals=[example_evasion]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:29:29 [INFO] eval_worker: [E2E_VERIFY] turn=17 | PIPELINE_OUTPUT:
  signals_fired    : ['example_evasion']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:29:29 [INFO] eval_worker: [WORKER] ✅ turn=17 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (187ms)
17:29:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:29 [INFO] eval_worker: ✅ TURN 17 DONE
17:29:29 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:44 [INFO] eval_worker: ✅ TURN 18 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:29:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:44 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:29:44 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=18
17:29:44 [INFO] eval_worker: [TURN] INTERVIEW | turn=18 | scoring_topic=? | covered=none | remaining=784s | mode=normal | saturation=0% (0.0/4.0)
17:29:44 [INFO] eval_worker: [QA] turn=18  Q: Thanks for being honest about that. What about the Campaign Metrics and Slack Reporting System—what part of that did you build or contribute to?
              A: I don't know.
17:29:44 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:29:44 [INFO] eval_worker: [QUALITY] turn=18 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:29:44 [INFO] eval_worker: [EVAL] turn=18 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
17:29:44 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:29:44 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:29:44 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:29:44 [INFO] eval_worker: [SATURATION] turn=18 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:29:44 [INFO] eval_worker: [DECISION] turn=18 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:29:44 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[none] sat=25% turn=18
17:29:44 [INFO] eval_worker: [RESULT] turn=18  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:29:44 [INFO] eval_worker: [E2E_VERIFY] turn=18 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:29:44 [INFO] eval_worker: [WORKER] ✅ turn=18 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (203ms)
17:29:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:29:44 [INFO] eval_worker: ✅ TURN 18 DONE
17:29:44 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:30:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:30:02 [INFO] eval_worker: ✅ TURN 19 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
17:30:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:30:02 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
17:30:02 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=19
17:30:02 [INFO] eval_worker: [TURN] INTERVIEW | turn=19 | scoring_topic=? | covered=none | remaining=766s | mode=normal | saturation=0% (0.0/4.0)
17:30:02 [INFO] eval_worker: [QA] turn=19  Q: Okay, I appreciate the honesty. Let’s shift a bit—what kind of work do you most enjoy doing day-to-day in your current or past roles?
              A: I can't answer.
17:30:02 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
17:30:02 [INFO] eval_worker: [QUALITY] turn=19 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
17:30:02 [INFO] eval_worker: [EVAL] turn=19 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
17:30:02 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
17:30:02 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
17:30:02 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
17:30:02 [INFO] eval_worker: [SATURATION] turn=19 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
17:30:02 [INFO] eval_worker: [DECISION] turn=19 | depth_decay=False weak_exit=False saturated=False action=PROBE
17:30:02 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[none] sat=25% turn=19
17:30:02 [INFO] eval_worker: [RESULT] turn=19  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
17:30:02 [INFO] eval_worker: [E2E_VERIFY] turn=19 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
17:30:02 [INFO] eval_worker: [WORKER] ✅ turn=19 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (192ms)
17:30:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
17:30:02 [INFO] eval_worker: ✅ TURN 19 DONE
17:30:02 [INFO] eval_worker: ────────────────────────────────────────────────────────────
