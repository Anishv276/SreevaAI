PYTHON:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python agent.py dev
    12:17:04.346 DEBUG    asyncio            Using proactor: IocpProactor
    12:17:04.365 DEV      livekit.agents     Watching C:\Users\vamsi\OneDrive\Desktop\HR-updates
    12:17:12.768 DEBUG    asyncio            Using proactor: IocpProactor
    12:17:12.796 INFO     livekit.agents     starting worker {"version": "1.5.10", "rtc-version": "1.1.8"}
    12:17:12.799 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.cartesia", "version": "1.5.10"}
    12:17:12.803 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.deepgram", "version": "1.5.10"}
    12:17:12.808 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.openai", "version": "1.5.10"}
    12:17:12.811 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.sarvam", "version": "1.5.10"}
    12:17:12.813 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.silero", "version": "1.5.10"}
    12:17:12.819 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.elevenlabs", "version": "1.5.10"}
    12:17:12.826 INFO     livekit.agents     HTTP server listening on :49327
    12:17:12.834 INFO     livekit.agents     initializing job runner {"tid": 23752}
{"timestamp": "2026-05-31 12:17:12,838", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 406, "taskName": null}
{"timestamp": "2026-05-31 12:17:13,171", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 409, "taskName": null}
{"timestamp": "2026-05-31 12:17:13,172", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-05-31 12:17:13,172", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 417, "taskName": null}
{"timestamp": "2026-05-31 12:17:13,173", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 422, "taskName": null}
{"timestamp": "2026-05-31 12:17:13,173", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 437, "taskName": null}
    12:17:13.174 DEBUG    asyncio            Using proactor: IocpProactor
    12:17:13.178 INFO     livekit.agents     job runner initialized {"tid": 23752, "elapsed_time": 0.34}
    12:17:13.490 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id": "AW_BM39dGtcNgSB", "url":
"wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India South", "protocol": 17}
    12:17:51.192 INFO     livekit.agents     received job request
                                         {"job_id": "AJ_89AYfNUUxoC6", "dispatch_id": "AD_mwJUPZomCkQx", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "room_id": "RM_kjnvctrSnNW9", "agent_name": "ai_interviewer", "resuming":
false, "enable_recording": false}
    12:17:51.240 DEBUG    livekit.agents     received assignment
                                         {"agent_name": "ai_interviewer", "room_id": "RM_kjnvctrSnNW9", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "job_id": "AJ_89AYfNUUxoC6", "dispatch_id": "AD_mwJUPZomCkQx",
"enable_recording": false}
{"timestamp": "2026-05-31 12:17:51,249", "level": "INFO", "message": "Connecting to room interview_app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_runtime", "line": 519, "taskName": "job_user_entrypoint"}
{"timestamp": "2026-05-31 12:17:51,249", "level": "INFO", "message": "[SESSION] interview context loaded", "logger": "interview-agent", "module": "agent_runtime", "line": 574, "taskName": "job_user_entrypoint", "event": "session_start", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:51.269 INFO     livekit.agents     initializing job runner {"tid": 15960}
{"timestamp": "2026-05-31 12:17:51,272", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 406, "taskName": null}
{"timestamp": "2026-05-31 12:17:51,454", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 409, "taskName": null}
{"timestamp": "2026-05-31 12:17:51,454", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-05-31 12:17:51,455", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 417, "taskName": null}
{"timestamp": "2026-05-31 12:17:51,455", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 422, "taskName": null}
{"timestamp": "2026-05-31 12:17:51,455", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 437, "taskName": null}
    12:17:51.457 INFO     livekit.agents     job runner initialized {"tid": 15960, "elapsed_time": 0.19}
    12:17:51.458 DEBUG    asyncio            Using proactor: IocpProactor
{"timestamp": "2026-05-31 12:17:52,034", "level": "INFO", "message": "[STARTUP] Fetched  resume=YES jd=NO custom_q=0 | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 658, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,034", "level": "INFO", "message": "[STARTUP] Custom questions: NONE configured", "logger": "interview-agent", "module": "agent_runtime", "line": 673, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,034", "level": "INFO", "message": "[FLOW] Custom questions  none configured", "logger": "interview-agent", "module": "agent_runtime", "line": 681, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,035", "level": "INFO", "message": "[FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 739, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,038", "level": "INFO", "message": "[INTERVIEW_CONTEXT]\nCANDIDATE: Vadla Vamsi Krishna | ROLE: GTM engineer | BAND: fresher | TIME: 20m\n\nFETCH SUMMARY:\n  Resume: fetched | JD: MISSING | Custom Q: 0\n  JD Must-Have Skills: none\n  JD Nice-To-Have: none\n  Coverage Targets: python, ai, datascience, powerbi, n8n, zapier, Multi Channel Lead Qualification System, Sensex Analysis Project\n\nRESUME BRIEF:\n  Anchor: Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website] (type: project)\n  Skills: python, ai, datascience, powerbi, n8n\n  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System\n  Work History: Personal Brand & Marketing Automation Strategist | Python Developer\n  Internships: none\n  Education: B.Tech | MPC\n\nINTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. Open with: 'Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website]'. Band=fresher: probe HOW they think  real decisions, specifics, learning signals. Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural.", "logger": "interview-agent", "module": "agent_runtime", "line": 819, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,045", "level": "INFO", "message": "[FLOW] System prompt ready  greeting  warmup  interview", "logger": "interview-agent", "module": "agent_runtime", "line": 845, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,045", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3-general language=en-US diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,046", "level": "INFO", "message": "[TTS] Using SARVAM  voice=priya model=bulbul:v3", "logger": "interview-agent", "module": "agent_runtime", "line": 855, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:52,046", "level": "INFO", "message": "[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en voice=priya api_key_len=36", "logger": "interview-agent", "module": "agent_providers", "line": 613, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,026", "level": "INFO", "message": "[FLOW] Greeting precomputed during launching phase", "logger": "interview-agent", "module": "agent_runtime", "line": 883, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:53.037 DEBUG    livekit.agents     input stream attached
                                         {"participant": null, "source": "SOURCE_UNKNOWN", "accepted_sources":
["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:53.044 INFO     livekit.agents     adaptive interruption detector initialized
                                         {"base_url": "https://agent-gateway.livekit.cloud/v1", "detection_interval":
0.1, "audio_prefix_duration": 1.0, "max_audio_duration": 3, "min_frames": 2, "threshold": 0.5, "inference_timeout": 0.7,
"use_proxy": true, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:53.051 DEBUG    livekit.agents     http_session(): creating a new httpclient ctx
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:53.058 DEBUG    livekit.agents     using audio io: `RoomIO` -> `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:53.062 DEBUG    livekit.agents     using transcript io: `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:17:53,067", "level": "INFO", "message": "[FLOW] launch_prereqs_ready signal sent to frontend", "logger": "interview-agent", "module": "agent_runtime", "line": 1057, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,068", "level": "INFO", "message": "[FLOW] Session started  candidate=Vadla Vamsi Krishna role=GTM engineer band=fresher tts=SARVAM llm=gpt-4.1-mini boot=1819ms", "logger": "interview-agent", "module": "agent_runtime", "line": 2171, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,068", "level": "INFO", "message": "[FLOW] Greeting started  20-min interview timer begins NOW", "logger": "interview-agent", "module": "agent_runtime", "line": 2186, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:53.070 DEBUG    livekit.agents     start reading stream
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmps7cu-8541", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:17:53,078", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=816be97c5e52 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,082", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the G T M engineer role. How are you doing? Hope the day's been good to you.\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,082", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,174", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,243", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmps7cu-8541 marked as IN_PROGRESS.", "logger": "interview-agent", "module": "agent_persistence", "line": 968, "taskName": "Task-60", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,358", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=816be97c5e52 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:53,424", "level": "INFO", "message": "[REDIS_EVAL] Redis eval client connected and ping OK  redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768", "logger": "interview-agent", "module": "agent_runtime", "line": 1006, "taskName": "Task-35", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:53.711 DEBUG    livekit.agents     aec warmup active, disabling interruptions for 0.50s
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:17:53,714", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:53.944 DEBUG    livekit.….deepgram Established new Deepgram STT WebSocket connection:
                                           {"headers": {"dg-project-id": "9ac4806b-a6d5-44a5-bf62-c3c6bbfc33e1",
"dg-request-id": "019e7cca-05b6-7843-bdfb-e79b15a0e232", "Date": "Sun, 31 May 2026 06:47:55 GMT"}, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:54.213 DEBUG    livekit.agents     aec warmup expired, re-enabling interruptions
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:17:57,921", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:17:58.220 DEBUG    livekit.agents     interruption detected
                                         {"total_duration": 0.1984109, "prediction_duration": 0.031029014,
"detection_delay": 0.358889102935791, "probability": 0.8878248929977417, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:17:58.720 DEBUG    livekit.agents     min endpointing delay updated: 0.8 -> 1.0708225917816163
                                         {"reason": "pause between utterances", "pause": 3.508225917816162, "max_delay":
2.0, "min_delay": 1.0708225917816163, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:17:58,789", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=816be97c5e52 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:58,791", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=816be97c5e52 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:17:58,844", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=816be97c5e52 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,784", "level": "DEBUG", "message": "Transcript: Interviewer[10]: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM engineer role. How are you doing? Hope the day's been good to you.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 189, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,785", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=0 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1891, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,788", "level": "INFO", "message": "✅ TURN 1 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,789", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,789", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,792", "level": "INFO", "message": "[TRANSCRIPT] Greeting appended to transcript (session.say bypass)", "logger": "interview-agent", "module": "agent_runtime", "line": 2208, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,794", "level": "INFO", "message": "[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)", "logger": "interview-agent", "module": "agent_runtime", "line": 2209, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,795", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:03,796", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started after greeting delivery", "logger": "interview-agent", "module": "agent_runtime", "line": 2254, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:05,069", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:06.919 DEBUG    livekit.agents     min endpointing delay updated: 1.0708225917816163 -> 1.6497818307876586
                                         {"reason": "pause between utterances", "pause": 6.860414981842041, "max_delay":
2.0, "min_delay": 1.6497818307876586, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:18:07.691 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. It's so good. How about you?", "language": "en-US",
"transcript_delay": 1.321681022644043, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:08,026", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 1953, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,026", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 fragment #1: 'Yeah. It's so good. How about you?...' (consolidated: 'Yeah. It's so good. How about you?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,027", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 - debounce 0.30s (is_complete=True, words=7)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,030", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=ea9548d3854b model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,322", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=ea9548d3854b payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,329", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=1 - 1 fragments  complete utterance (sentence_complete): 'Yeah. It's so good. How about you?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-215", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,330", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing greeting replay (turn already processed): 'Yeah. It's so good. How about you?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1244, "taskName": "Task-215", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,427", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,427", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:08,428", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:11,044", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Ha, good! Been a packed day of interviews, happy to have a good chat now. Ready to jump in?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:11,044", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:11,410", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:14,086", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=ea9548d3854b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:14,086", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=ea9548d3854b model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:14,137", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=ea9548d3854b close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:17,579", "level": "DEBUG", "message": "Transcript: Interviewer[24]: Ha, good! Been a packed day of interviews—happy to have a good chat now. Ready to jump in?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:17,579", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=1 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1891, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:17,579", "level": "INFO", "message": "✅ TURN 2 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:17,580", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:17,580", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:18,771", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:19.670 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 5.065848350524902, "max_delay": 2.0,
"min_delay": 1.6497818307876586, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:20,569", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:22.818 DEBUG    livekit.agents     min endpointing delay updated: 1.6497818307876586 -> 1.6259064146995543
                                         {"reason": "pause between utterances", "pause": 1.4110276699066162,
"max_delay": 2.0, "min_delay": 1.6259064146995543, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:18:22.823 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. Yeah.", "language": "en-US", "transcript_delay":
0.5541293621063232, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:23,898", "level": "INFO", "message": "[WARMUP]  WARMUP COMPLETE at turn=2  INTERVIEW PHASE ACTIVE", "logger": "interview-agent", "module": "agent_runtime", "line": 1939, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:23,898", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 1953, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:23,898", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 fragment #1: 'Yeah. Yeah....' (consolidated: 'Yeah. Yeah....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:23,899", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 - debounce 0.30s (is_complete=True, words=2)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:23,902", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=1979538bdbc5 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,130", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=1979538bdbc5 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,170", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,200", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=2 - 1 fragments  complete utterance (sentence_complete): 'Yeah. Yeah....'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-327", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,201", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (1 words): 'Yeah.'", "logger": "interview-agent", "module": "agent_runtime", "line": 1284, "taskName": "Task-327", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,299", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-311", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,300", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-311", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:24,300", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-311", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:24.871 DEBUG    livekit.agents     min endpointing delay updated: 1.6259064146995543 -> 1.6496410372066497
                                         {"reason": "pause between utterances", "pause": 1.8632526397705078,
"max_delay": 2.0, "min_delay": 1.6496410372066497, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:25,371", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:26.071 DEBUG    livekit.agents     min endpointing delay updated: 1.6496410372066497 -> 1.5858425857610703
                                         {"reason": "pause between utterances", "pause": 1.0116565227508545,
"max_delay": 2.0, "min_delay": 1.5858425857610703, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:26,172", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Great, let's get into it! On your Multi Channel Lead Qualification System project, what was the hardest part of building that automation across Instagram, Facebook, website, and email?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-322", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:26,173", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-322", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:26,575", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:28,270", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:31,453", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=1979538bdbc5 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:31,453", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=1979538bdbc5 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:31,511", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=1979538bdbc5 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,948", "level": "DEBUG", "message": "Transcript: Interviewer[43]: Great, let's get into it! On your Multi Channel Lead Qualification System project, what was the hardest part of building that automation across Instagram, Facebook, website, and email?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,948", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=2 last_q='On your Multi Channel Lead Qualification System project, wha' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,949", "level": "INFO", "message": "[PHASE_STATUS] Opening question sealed: 'On your Multi Channel Lead Qualification System project, what was the hardest pa'", "logger": "interview-agent", "module": "agent_runtime", "line": 1880, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,949", "level": "INFO", "message": "[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)", "logger": "interview-agent", "module": "agent_runtime", "line": 1889, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,949", "level": "INFO", "message": "✅ TURN 3 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,949", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:36,949", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:38,774", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:41,669", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:42.448 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "It's mostly", "language": "en-US", "transcript_delay":
0.027949810028076172, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:18:44.771 DEBUG    livekit.agents     min endpointing delay updated: 1.5858425857610703 -> 1.5634560133803368
                                         {"reason": "pause between utterances", "pause": 1.3619768619537354,
"max_delay": 2.0, "min_delay": 1.5634560133803368, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:46,103", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 fragment #1: 'It's mostly...' (consolidated: 'It's mostly...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:46,178", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 - debounce 0.30s (is_complete=True, words=2)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:46,186", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=5a5e96b60ba5 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:46,228", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:46,484", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=3 - 1 fragments  complete utterance (sentence_complete): 'It's mostly...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-474", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:46,485", "level": "DEBUG", "message": "[TRANSCRIPT] Ignoring probable STT fragment (2 words): 'It's mostly'", "logger": "interview-agent", "module": "agent_runtime", "line": 1284, "taskName": "Task-474", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:46.549 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "integrating APIs and", "language": "en-US",
"transcript_delay": 0.07903861999511719, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:46,861", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=5a5e96b60ba5 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:49.619 DEBUG    livekit.agents     min endpointing delay updated: 1.5634560133803368 -> 1.6040801357437802
                                         {"reason": "pause between utterances", "pause": 1.9696972370147705,
"max_delay": 2.0, "min_delay": 1.6040801357437802, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:18:50.702 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "writing good prompts for AI to reply them.", "language":
"en-US", "transcript_delay": 1.631554365158081, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:18:50,708", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-467", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,708", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-467", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,712", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=5a5e96b60ba5 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,714", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=5a5e96b60ba5 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,716", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,717", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,724", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 already processed — dropping late fragment 'integrating APIs and writing good prompts for AI to reply th'", "logger": "interview-agent", "module": "agent_runtime", "line": 1944, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:50,729", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=69f3bfe3ad28 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:51,012", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=69f3bfe3ad28 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:18:54,269", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:18:57.072 DEBUG    livekit.agents     min endpointing delay updated: 1.6040801357437802 -> 1.9598443881758718
                                         {"reason": "pause between utterances", "pause": 5.161722660064697, "max_delay":
2.0, "min_delay": 1.9598443881758718, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:19:04,115", "level": "INFO", "message": "[TIMER] remaining=1129s turn=3", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:06,123", "level": "WARNING", "message": "[LLM_GATE] ⏰ timed out (15s) — generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 278, "taskName": "Task-501", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:06,125", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-501", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:06,125", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-501", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:07,428", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, that tracks, A P I integration can definitely be tricky. Can you give me a specific example of one A P I challenge you faced and how you solved it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-513", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:07,428", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-513", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:07,721", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:11,014", "level": "DEBUG", "message": "[TTS_SARVAM_WS_KEEPALIVE] request_id=69f3bfe3ad28 ping_sent", "logger": "interview-agent", "module": "agent_providers", "line": 475, "taskName": "SarvamDirectSynthesizeStream.keepalive", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:11,110", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=69f3bfe3ad28 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:11,111", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=69f3bfe3ad28 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:11,178", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=69f3bfe3ad28 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:15,406", "level": "DEBUG", "message": "Transcript: Interviewer[82]: Got it, that tracks—API integration can definitely be tricky. Can you give me a specific example of one API challenge you faced and how you solved it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:15,406", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=3 last_q='Can you give me a specific example of one API challenge you ' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:15,407", "level": "INFO", "message": "✅ TURN 4 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:15,407", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:15,407", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:18,119", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:19:22.621 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I faced during meta API because approvals take a lot of
time.", "language": "en-US", "transcript_delay": 0.25267934799194336, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:19:22.919 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 11.224088430404663, "max_delay": 2.0,
"min_delay": 1.9598443881758718, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:19:24,330", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 fragment #1: 'I faced during meta API because approvals take a l...' (consolidated: 'I faced during meta API because approvals take a lot of time...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,330", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 - debounce 0.30s (is_complete=True, words=12)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,333", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=1fc174412715 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,619", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=1fc174412715 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,632", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=4 - 1 fragments  complete utterance (sentence_complete): 'I faced during meta API because approvals take a lot of time....'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,633", "level": "DEBUG", "message": "Transcript: Candidate[91]: I faced during meta API because approvals take a lot of time.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,634", "level": "INFO", "message": "[EVAL_GATE] turn=4 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,637", "level": "INFO", "message": "[LIVE_N] turn=4 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:24,932", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=4 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:25,102", "level": "INFO", "message": "[TRANSCRIPT] Partial save 5 lines, 91s duration, 1 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-665", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:19:26.793 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So I faced there.", "language": "en-US", "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:19:28,639", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=4 | routing timeout (3.7s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-664", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:28,640", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-649", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:28,641", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-649", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:28,641", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-649", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:29,885", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That’s actually a smart call, navigating Meta’s approval process can slow things down a lot. How did you plan your work around that delay?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-660", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:29,885", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-660", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:30,251", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:33,421", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=1fc174412715 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:33,424", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=1fc174412715 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:33,483", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=1fc174412715 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:37,750", "level": "DEBUG", "message": "Transcript: Interviewer[104]: That’s actually a smart call—navigating Meta’s approval process can slow things down a lot. How did you plan your work around that delay?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:37,751", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=4 last_q='How did you plan your work around that delay?' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:37,752", "level": "INFO", "message": "✅ TURN 5 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:37,752", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:37,753", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:40,919", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:19:40.958 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yes.", "language": "en-US", "transcript_delay":
0.03760504722595215, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:19:44.782 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "It's mostly whenever I face any issues, I use RGBD.",
"language": "en-US", "transcript_delay": 0.012626886367797852, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:19:49.020 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 7.9072425365448, "max_delay": 2.0, "min_delay":
1.9598443881758718, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:19:49.670 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Else anything. Then based on that, I'll work out on some
other stuff.", "language": "en-US", "transcript_delay": 1.2001676559448242, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:19:50,434", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 fragment #1: 'So I faced there. Yes. It's mostly whenever I face...' (consolidated: 'So I faced there. Yes. It's mostly whenever I face any issue...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,434", "level": "DEBUG", "message": "[STT_BUFFER] turn=5 - debounce 0.30s (is_complete=True, words=28)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,436", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=f1540f01f3b6 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,668", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=f1540f01f3b6 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,737", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=5 - 1 fragments  complete utterance (sentence_complete): 'So I faced there. Yes. It's mostly whenever I face any issues, I use RGBD. Else ...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,737", "level": "DEBUG", "message": "Transcript: Candidate[117]: So I faced there. Yes. It's mostly whenever I face any issues, I use RGBD. Else anything. Then based on that, I'll work out on some other stuff.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,737", "level": "INFO", "message": "[EVAL_GATE] turn=5 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,738", "level": "INFO", "message": "[LIVE_N] turn=5 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:50,853", "level": "INFO", "message": "[TRANSCRIPT] Partial save 7 lines, 117s duration, 2 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-821", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:51,323", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=5 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:53,329", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=5 | routing timeout (2.0s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-820", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:53,330", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:53,332", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:53,332", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-805", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:54,514", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hmm, that's a bit broad, what was specifically your approach with R G BD in this context?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-816", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:54,515", "level": "INFO", "message": "[TTS] Streamed 1 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-816", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:54,879", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:57,892", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=f1540f01f3b6 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:57,894", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=f1540f01f3b6 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:19:57,945", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=f1540f01f3b6 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:01,856", "level": "DEBUG", "message": "Transcript: Interviewer[128]: Hmm, that's a bit broad—what was specifically your approach with RGBD in this context?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:01,857", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=5 last_q=\"Hmm, that's a bit broad—what was specifically your approach \" topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:01,857", "level": "INFO", "message": "✅ TURN 6 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:01,858", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:01,859", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:03,119", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:04,183", "level": "INFO", "message": "[TIMER] remaining=1069s turn=6", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:20:06.623 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. It's not RGBD. It's chart gbt.", "language": "en-US",
"transcript_delay": 0.0034050941467285156, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:10.437 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "It's an open AI model, ChargeGPT. So where I'll work on
that,", "language": "en-US", "transcript_delay": 0.017917871475219727, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:14.653 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I'll go to ChatGPT, I'll search for this word, the main
problem, this word I need to solve.", "language": "en-US", "transcript_delay": 0.03170323371887207, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:17.971 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.434209108352661, "max_delay": 2.0,
"min_delay": 1.9598443881758718, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:20:18,070", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:20:19.218 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So I'll do better than that. So I'll use that, and I'll",
"language": "en-US", "transcript_delay": 0.046033620834350586, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:19.768 DEBUG    livekit.agents     min endpointing delay updated: 1.9598443881758718 -> 1.8249475100119712
                                         {"reason": "pause between utterances", "pause": 0.6108756065368652,
"max_delay": 2.0, "min_delay": 1.8249475100119712, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:20:21,057", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 fragment #1: 'No. It's not RGBD. It's chart gbt. It's an open AI...' (consolidated: 'No. It's not RGBD. It's chart gbt. It's an open AI model, Ch...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,057", "level": "DEBUG", "message": "[STT_BUFFER] turn=6 - debounce 0.30s (is_complete=True, words=49)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,059", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=b00228d9061c model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,305", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=b00228d9061c payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,359", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=6 - 1 fragments  complete utterance (sentence_complete): 'No. It's not RGBD. It's chart gbt. It's an open AI model, ChargeGPT. So where I'...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,360", "level": "DEBUG", "message": "Transcript: Candidate[148]: No. It's not RGBD. It's chart gbt. It's an open AI model, ChargeGPT. So where I'll work on that, I'll go to ChatGPT, I'll search for this word, the main problem, this word I need to solve. So I'll do better than that. So I'll use that, and I'll", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,360", "level": "INFO", "message": "[EVAL_GATE] turn=6 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,360", "level": "INFO", "message": "[LIVE_N] turn=6 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,498", "level": "INFO", "message": "[TRANSCRIPT] Partial save 9 lines, 148s duration, 3 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-964", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:21,924", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=6 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:20:22.988 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "figure out all the challenges.", "language": "en-US",
"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:20:24,630", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=6 | routing timeout (2.7s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-963", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:24,630", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-948", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:24,632", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-948", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:24,632", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-948", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:26,375", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Ah, okay, that makes sense, you used ChatG P T to troubleshoot and find solutions. How did you decide when to switch from waiting on the A P I approval to focusing on other parts of the project?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-959", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:26,376", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-959", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:26,761", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:31,614", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=b00228d9061c model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:31,614", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=b00228d9061c model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:31,658", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=b00228d9061c close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:37,656", "level": "DEBUG", "message": "Transcript: Interviewer[164]: Ah, okay, that makes sense—you used ChatGPT to troubleshoot and find solutions. How did you decide when to switch from waiting on the API approval to focusing on other parts of the project?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:37,657", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=6 last_q='How did you decide when to switch from waiting on the API ap' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:37,658", "level": "INFO", "message": "✅ TURN 7 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:37,658", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:37,658", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:40,023", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:20:43.218 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. Like, if everything is", "language": "en-US",
"transcript_delay": 0.04923677444458008, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:46.018 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 7.56839919090271, "max_delay": 2.0,
"min_delay": 1.8249475100119712, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:20:46.557 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "good at API, then we'll do testing. If not good, then
we'll focus on API.", "language": "en-US", "transcript_delay": 1.0870206356048584, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:20:47,299", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 fragment #1: 'figure out all the challenges. No. Like, if everyt...' (consolidated: 'figure out all the challenges. No. Like, if everything is go...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,299", "level": "DEBUG", "message": "[STT_BUFFER] turn=7 - debounce 0.30s (is_complete=True, words=25)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,301", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=4e69c53243c5 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,559", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=4e69c53243c5 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,602", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=7 - 1 fragments  complete utterance (sentence_complete): 'figure out all the challenges. No. Like, if everything is good at API, then we'l...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,602", "level": "DEBUG", "message": "Transcript: Candidate[174]: figure out all the challenges. No. Like, if everything is good at API, then we'll do testing. If not good, then we'll focus on API.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,602", "level": "INFO", "message": "[EVAL_GATE] turn=7 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,603", "level": "INFO", "message": "[LIVE_N] turn=7 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:47,732", "level": "INFO", "message": "[TRANSCRIPT] Partial save 11 lines, 174s duration, 4 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1133", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:48,227", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=7 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:50,541", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=7 | routing timeout (2.3s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-1132", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:50,542", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1117", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:50,542", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1117", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:50,543", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1117", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:51,578", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, that’s a clear way to prioritize, testing only when the A P I is ready. What part of the testing process did you personally handle once the A P I was approved?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1128", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:51,578", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1128", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:51,927", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:57,424", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=4e69c53243c5 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:57,432", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=4e69c53243c5 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:20:57,485", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=4e69c53243c5 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,270", "level": "INFO", "message": "[TIMER] remaining=1009s turn=7", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,468", "level": "DEBUG", "message": "Transcript: Interviewer[191]: Okay, that’s a clear way to prioritize—testing only when the API is ready. What part of the testing process did you personally handle once the API was approved?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,468", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=7 last_q='What part of the testing process did you personally handle o' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,469", "level": "INFO", "message": "✅ TURN 8 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,469", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:04,470", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:07,070", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:21:08.487 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Testing, like,", "language": "en-US", "transcript_delay":
0.017869234085083008, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:12.938 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "giving real messages, sending real messages, and trying
how to place being gender", "language": "en-US", "transcript_delay": 0.018149375915527344, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:16.820 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.484609603881836, "max_delay": 2.0,
"min_delay": 1.8249475100119712, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:21:16,918", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:21:17.895 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Is it, human? Is it, like, a so on so?", "language":
"en-US", "transcript_delay": 0.025460243225097656, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:20.723 DEBUG    livekit.agents     min endpointing delay updated: 1.8249475100119712 -> 1.7034787599873364
                                         {"reason": "pause between utterances", "pause": 0.610260009765625, "max_delay":
2.0, "min_delay": 1.7034787599873364, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:21.767 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Feeling like it's an adaptive chat instead of bot chat?",
"language": "en-US", "transcript_delay": 1.5484991073608398, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:21:21,924", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 fragment #1: 'Testing, like, giving real messages, sending real ...' (consolidated: 'Testing, like, giving real messages, sending real messages, ...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:21,925", "level": "DEBUG", "message": "[STT_BUFFER] turn=8 - debounce 0.30s (is_complete=True, words=35)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:21,926", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=d703d6c182db model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,170", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=d703d6c182db payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,227", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=8 - 1 fragments  complete utterance (sentence_complete): 'Testing, like, giving real messages, sending real messages, and trying how to pl...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,227", "level": "DEBUG", "message": "Transcript: Candidate[209]: Testing, like, giving real messages, sending real messages, and trying how to place being gender Is it, human? Is it, like, a so on so? Feeling like it's an adaptive chat instead of bot chat?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,227", "level": "INFO", "message": "[EVAL_GATE] turn=8 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,228", "level": "INFO", "message": "[LIVE_N] turn=8 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,347", "level": "INFO", "message": "[TRANSCRIPT] Partial save 13 lines, 209s duration, 5 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1310", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:22,824", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=8 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:27,128", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=8 | routing timeout (4.3s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-1309", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:27,129", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1293", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:27,129", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1293", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:27,130", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1293", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:28,211", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Got it, so you focused on making the conversation feel natural and humanlike during testing. What was one specific change you made to improve that natural feel?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1304", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:28,211", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1304", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:28,566", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:32,106", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=d703d6c182db model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:32,107", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=d703d6c182db model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:32,192", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=d703d6c182db close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:36,770", "level": "DEBUG", "message": "Transcript: Interviewer[223]: Got it, so you focused on making the conversation feel natural and human-like during testing. What was one specific change you made to improve that natural feel?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:36,770", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=8 last_q='What was one specific change you made to improve that natura' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:36,770", "level": "INFO", "message": "✅ TURN 9 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:36,771", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:36,771", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:39,920", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:21:45.677 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Like, doing testing and giving prompts, like,",
"language": "en-US", "transcript_delay": 0.10778021812438965, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:49.096 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "it has to behave like a giving prompts to make",
"language": "en-US", "transcript_delay": 0.07592463493347168, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:50.597 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 8.419569969177246, "max_delay": 2.0,
"min_delay": 1.7034787599873364, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:21:50,670", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:21:53.081 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "it as a so which", "language": "en-US",
"transcript_delay": 0.012302637100219727, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:56.372 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "totally adaptive part, not as human. Like, we'll train
the", "language": "en-US", "transcript_delay": 0.0008080005645751953, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:21:58.870 DEBUG    livekit.agents     min endpointing delay updated: 1.7034787599873364 -> 1.5915768383114177
                                         {"reason": "pause between utterances", "pause": 0.5844595432281494,
"max_delay": 2.0, "min_delay": 1.5915768383114177, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:21:59,915", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 fragment #1: 'Like, doing testing and giving prompts, like, it h...' (consolidated: 'Like, doing testing and giving prompts, like, it has to beha...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:59,916", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 - debounce 0.30s (is_complete=True, words=32)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:21:59,918", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=9c05d0f8b671 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:21:59.936 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "agent to sorry. We'll train the prompt to behave like a
human.", "language": "en-US", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:22:00,217", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=9 - 1 fragments  complete utterance (sentence_complete): 'Like, doing testing and giving prompts, like, it has to behave like a giving pro...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,218", "level": "DEBUG", "message": "Transcript: Candidate[247]: Like, doing testing and giving prompts, like, it has to behave like a giving prompts to make it as a so which totally adaptive part, not as human. Like, we'll train the", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,218", "level": "INFO", "message": "[EVAL_GATE] turn=9 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,218", "level": "INFO", "message": "[LIVE_N] turn=9 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,334", "level": "INFO", "message": "[TRANSCRIPT] Partial save 15 lines, 247s duration, 6 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1494", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,400", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=9c05d0f8b671 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,923", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:00,925", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=9 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:22:03.120 DEBUG    livekit.agents     min endpointing delay updated: 1.5915768383114177 -> 1.6889464829714869
                                         {"reason": "pause between utterances", "pause": 2.5652732849121094,
"max_delay": 2.0, "min_delay": 1.6889464829714869, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:22:03,345", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=9 | routing timeout (2.4s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-1493", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:03,346", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1471", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:03,346", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1471", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:03,347", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1471", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,310", "level": "WARNING", "message": "[SINGLE_Q] Transform yielded empty after directive sanitization; suppressing output.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 97, "taskName": "Task-1482", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,310", "level": "INFO", "message": "[TTS] Streamed 0 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1482", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,311", "level": "WARNING", "message": "[TTS_SARVAM_WS_CANCELLED] request_id=9c05d0f8b671 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 516, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,312", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=9c05d0f8b671 close_code=1006", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,312", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,313", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,316", "level": "DEBUG", "message": "[STT_BUFFER] turn=9 already processed — dropping late fragment 'agent to sorry. We'll train the prompt to behave like a huma'", "logger": "interview-agent", "module": "agent_runtime", "line": 1944, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,319", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=70fcef393b22 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,548", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=70fcef393b22 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,567", "level": "INFO", "message": "[TIMER] remaining=949s turn=9", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,716", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1514", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,717", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1514", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:04,718", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1514", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:05,882", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'That makes sense, you tuned the prompts to make the A I sound more human in its responses. How did you measure or decide that the prompts were effective enough for your lead qualification system?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1524", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:05,883", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1524", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:06,159", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:11,919", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=70fcef393b22 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:11,920", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=70fcef393b22 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:11,969", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=70fcef393b22 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:18,879", "level": "DEBUG", "message": "Transcript: Interviewer[265]: That makes sense—you tuned the prompts to make the AI sound more human in its responses. How did you measure or decide that the prompts were effective enough for your lead qualification system?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:18,879", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=9 last_q='How did you measure or decide that the prompts were effectiv' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:18,880", "level": "INFO", "message": "✅ TURN 10 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:18,880", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:18,880", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:23,751", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:22:27.190 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Based on testing, we'll get to know are they going well or
not.", "language": "en-US", "transcript_delay": 0.021471500396728516, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:22:32.078 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So after testing, we'll see for seven days if they are
going well, if they are do", "language": "en-US", "transcript_delay": 0.00910329818725586, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:22:35.269 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 3.6139895915985107, "max_delay": 2.0,
"min_delay": 1.6889464829714869, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:22:36.332 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "anything really affect you. If not, we'll retrain the
prompt.", "language": "en-US", "transcript_delay": 1.6109743118286133, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:22:36,415", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 fragment #1: 'Based on testing, we'll get to know are they going...' (consolidated: 'Based on testing, we'll get to know are they going well or n...')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,415", "level": "DEBUG", "message": "[STT_BUFFER] turn=10 - debounce 0.30s (is_complete=True, words=40)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,417", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=8cfd1a8445c0 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,675", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=8cfd1a8445c0 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,718", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=10 - 1 fragments  complete utterance (sentence_complete): 'Based on testing, we'll get to know are they going well or not. So after testing...'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,718", "level": "DEBUG", "message": "Transcript: Candidate[283]: Based on testing, we'll get to know are they going well or not. So after testing, we'll see for seven days if they are going well, if they are do anything really affect you. If not, we'll retrain the prompt.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,719", "level": "INFO", "message": "[EVAL_GATE] turn=10 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,720", "level": "INFO", "message": "[LIVE_N] turn=10 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:36,832", "level": "INFO", "message": "[TRANSCRIPT] Partial save 17 lines, 283s duration, 7 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1698", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:37,324", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=10 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:39,424", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=10 | routing timeout (2.1s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-1697", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:39,425", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1682", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:39,425", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1682", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:39,426", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1682", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:40,722", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, so you used a realtime feedback loop over a week to see if the prompts were working well and retrained if needed. That’s a thoughtful approach. What metrics or signals did you track during those seven days to decide if the prompts needed retraining?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1693", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:40,722", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1693", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:41,080", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:47,993", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=8cfd1a8445c0 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:47,994", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=8cfd1a8445c0 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:48,044", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=8cfd1a8445c0 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:56,206", "level": "DEBUG", "message": "Transcript: Interviewer[303]: Okay, so you used a real-time feedback loop over a week to see if the prompts were working well and retrained if needed. That’s a thoughtful approach. What metrics or signals did you track during those seven days to decide if the prompts needed retraining?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:56,207", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=10 last_q='What metrics or signals did you track during those seven day' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:56,207", "level": "INFO", "message": "✅ TURN 11 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:56,208", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:22:56,208", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:00,519", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:02.722 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 6.386281728744507, "max_delay": 2.0,
"min_delay": 1.6889464829714869, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:23:02.779 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I didn't do that. My team did it.", "language": "en-US",
"transcript_delay": 0.6090412139892578, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:03,862", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 fragment #1: 'I didn't do that. My team did it....' (consolidated: 'I didn't do that. My team did it....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:03,862", "level": "DEBUG", "message": "[STT_BUFFER] turn=11 - debounce 0.30s (is_complete=True, words=8)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:03,864", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=bb6c5b46a622 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,105", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=bb6c5b46a622 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,164", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=11 - 1 fragments  complete utterance (sentence_complete): 'I didn't do that. My team did it....'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,165", "level": "DEBUG", "message": "Transcript: Candidate[311]: I didn't do that. team did it.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,165", "level": "INFO", "message": "[EVAL_GATE] turn=11 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,166", "level": "INFO", "message": "[LIVE_N] turn=11 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,264", "level": "INFO", "message": "[TRANSCRIPT] Partial save 19 lines, 311s duration, 8 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-1878", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,629", "level": "INFO", "message": "[TIMER] remaining=888s turn=11", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:04,722", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=11 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:05,520", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:07.123 DEBUG    livekit.agents     min endpointing delay updated: 1.6889464829714869 -> 1.8510480857806002
                                         {"reason": "pause between utterances", "pause": 3.309962511062622, "max_delay":
2.0, "min_delay": 1.8510480857806002, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:07,423", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=11 | routing timeout (2.7s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-1877", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:07,424", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-1862", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:07,424", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-1862", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:07,425", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-1862", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:08,657", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'I appreciate that, thanks for being straight with me. What was your role in coordinating or communicating with the team during that testing and feedback period?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-1873", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:08,657", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-1873", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:09,021", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:12,401", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=bb6c5b46a622 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:12,402", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=bb6c5b46a622 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:12,457", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=bb6c5b46a622 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:16,808", "level": "DEBUG", "message": "Transcript: Interviewer[323]: I appreciate that, thanks for being straight with me. What was your role in coordinating or communicating with the team during that testing and feedback period?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:16,808", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=11 last_q='What was your role in coordinating or communicating with the' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:16,809", "level": "INFO", "message": "✅ TURN 12 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:16,809", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:16,809", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:19,470", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:20.520 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 2.4739108085632324, "max_delay": 2.0,
"min_delay": 1.8510480857806002, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:20,720", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:23.469 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "No. And it's not a good feedback, but okay.", "language":
"en-US", "transcript_delay": 0.25009846687316895, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:23:23.769 DEBUG    livekit.agents     min endpointing delay updated: 1.8510480857806002 -> 1.737193405948573
                                         {"reason": "pause between utterances", "pause": 0.7125012874603271,
"max_delay": 2.0, "min_delay": 1.737193405948573, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:23:24.536 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "We are done.", "language": "en-US", "transcript_delay":
1.316765308380127, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:24,869", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:27.920 DEBUG    livekit.agents     min endpointing delay updated: 1.737193405948573 -> 1.7245948377154712
                                         {"reason": "pause between utterances", "pause": 1.6112077236175537,
"max_delay": 2.0, "min_delay": 1.7245948377154712, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:28,170", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:29.119 DEBUG    livekit.agents     min endpointing delay updated: 1.7245948377154712 -> 1.628335648438553
                                         {"reason": "pause between utterances", "pause": 0.7620029449462891,
"max_delay": 2.0, "min_delay": 1.628335648438553, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:30,201", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 fragment #1: 'No. And it's not a good feedback, but okay. We are...' (consolidated: 'No. And it's not a good feedback, but okay. We are done....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,201", "level": "DEBUG", "message": "[STT_BUFFER] turn=12 - debounce 0.30s (is_complete=True, words=12)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,204", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=8f08d93d7252 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,463", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=8f08d93d7252 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,503", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=12 - 1 fragments  complete utterance (sentence_complete): 'No. And it's not a good feedback, but okay. We are done....'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,503", "level": "DEBUG", "message": "Transcript: Candidate[337]: No. And it's not a good feedback, but okay. We are done.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,504", "level": "INFO", "message": "[EVAL_GATE] turn=12 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,504", "level": "INFO", "message": "[LIVE_N] turn=12 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:30,629", "level": "INFO", "message": "[TRANSCRIPT] Partial save 21 lines, 337s duration, 9 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2036", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:31,120", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=12 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:33,124", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=12 | routing timeout (2.0s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-2035", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:33,124", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-2020", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:33,125", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-2020", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:33,126", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-2020", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:33,370", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:34,182", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for being honest about that. Let’s talk about your Sensex Analysis Project, what was the most interesting insight you uncovered from the market data you analyzed?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2031", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:34,183", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-2031", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:34.319 DEBUG    livekit.agents     min endpointing delay updated: 1.628335648438553 -> 1.941761172110933
                                         {"reason": "pause between utterances", "pause": 4.7625908851623535,
"max_delay": 2.0, "min_delay": 1.941761172110933, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:34,554", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:39,008", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=8f08d93d7252 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:39,009", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=8f08d93d7252 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:39,077", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=8f08d93d7252 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:43,908", "level": "DEBUG", "message": "Transcript: Interviewer[350]: Thanks for being honest about that. Let’s talk about your Sensex Analysis Project—what was the most interesting insight you uncovered from the market data you analyzed?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:43,908", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=12 last_q='Let’s talk about your Sensex Analysis Project—what was the m' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:43,909", "level": "INFO", "message": "✅ TURN 13 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:43,909", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:43,909", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:44,919", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:23:49.119 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 1.941761172110933
                                         {"reason": "new turn", "pause": 0.8099346160888672, "max_delay":
1.941761172110933, "min_delay": 1.941761172110933, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    12:23:51.213 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I do that project.", "language": "en-US",
"transcript_delay": 2.642611503601074, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:23:51,222", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 fragment #1: 'I do that project....' (consolidated: 'I do that project....')", "logger": "interview-agent", "module": "agent_runtime", "line": 1962, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,223", "level": "DEBUG", "message": "[STT_BUFFER] turn=13 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2049, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,224", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=9623290b96b4 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,497", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=9623290b96b4 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,524", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=13 - 1 fragments  complete utterance (sentence_complete): 'I do that project....'", "logger": "interview-agent", "module": "agent_runtime", "line": 1995, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,525", "level": "DEBUG", "message": "Transcript: Candidate[358]: I do that project.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,525", "level": "INFO", "message": "[EVAL_GATE] turn=13 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1379, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,526", "level": "INFO", "message": "[LIVE_N] turn=13 | pushing payload | topic=None score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 1592, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:51,650", "level": "INFO", "message": "[TRANSCRIPT] Partial save 23 lines, 358s duration, 10 turn(s) for app app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 880, "taskName": "Task-2173", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:52,122", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=13 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1547, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:53,623", "level": "WARNING", "message": "[LIVE_N] ⏰ turn=13 | routing timeout (1.5s) — releasing LLM with existing directives", "logger": "interview-agent", "module": "agent_runtime", "line": 1794, "taskName": "Task-2172", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:53,628", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 275, "taskName": "Task-2154", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:53,634", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 306, "taskName": "Task-2154", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:53,636", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 315, "taskName": "Task-2154", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:54,806", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Okay, so you built the Sensex Analysis Project yourself, that’s great. What was one challenge you faced while working with the data, and how did you solve it?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-2165", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:54,807", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 364, "taskName": "Task-2165", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:55,208", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2090, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:59,549", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=9623290b96b4 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:59,549", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=9623290b96b4 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:23:59,610", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=9623290b96b4 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:04,560", "level": "DEBUG", "message": "Transcript: Interviewer[371]: Okay, so you built the Sensex Analysis Project yourself — that’s great. What was one challenge you faced while working with the data, and how did you solve it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:05,197", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=13 last_q='What was one challenge you faced while working with the data' topic=None", "logger": "interview-agent", "module": "agent_runtime", "line": 1862, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:05,906", "level": "INFO", "message": "✅ TURN 14 | phase=interview", "logger": "interview-agent", "module": "agent_runtime", "line": 1911, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:05,923", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2088, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:05,923", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2110, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-05-31 12:24:05,928", "level": "INFO", "message": "[TIMER] remaining=827s turn=14", "logger": "interview-agent", "module": "agent_runtime", "line": 2308, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    12:24:10.312 DEBUG    livekit.agents     stream closed
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmps7cu-8541", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-05-31 12:24:10,319", "level": "INFO", "message": "Candidate participant disconnected", "logger": "interview-agent", "module": "agent_runtime", "line": 1101, "taskName": "Task-33", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}


wROKER:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python -m interview.eval_worker
12:15:00 [INFO] eval_worker: [WORKER] Started — redis=redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768 queue=interview:eval_queue
12:19:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:25 [INFO] eval_worker: ✅ TURN 4 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:19:25 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:25 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:19:25 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=4
12:19:25 [INFO] eval_worker: [TURN] INTERVIEW | turn=4 | scoring_topic=? | covered=none | remaining=1108s | mode=normal | saturation=0% (0.0/4.0)
12:19:25 [INFO] eval_worker: [QA] turn=4  Q: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM engineer role. How are you doing? Hope the day's been good to you. Ha, good!
              A: I faced during meta API because approvals take a lot of time.
12:19:25 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:19:26,324", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=12 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-3"}
12:19:27 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:19:28 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:19:28,154", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=4 depth=2 specificity=3 grounding=3 | reason='approvals take a lot of time'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-3"}
12:19:28 [INFO] eval_worker: [QUALITY] turn=4 | clarity=4.0 depth=2.0 specificity=3.0 grounding=3.0 | avg=3.00 weighted=2.85 depth_signal=SURFACE
12:19:28 [INFO] eval_worker: [EVAL] turn=4 action=PROBE mode=depth quality_avg=3.00 signals=[none]
12:19:28 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.85 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:19:28 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:19:28 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:19:28 [INFO] eval_worker: [SATURATION] turn=4 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:19:28 [INFO] eval_worker: [DECISION] turn=4 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:19:28 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[none] sat=25% turn=4
12:19:28 [INFO] eval_worker: [RESULT] turn=4  action=PROBE     quality=3.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:19:28 [INFO] eval_worker: [E2E_VERIFY] turn=4 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:19:28 [INFO] eval_worker: [WORKER] ✅ turn=4 action=PROBE overall=3.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (3308ms)
12:19:28 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:28 [INFO] eval_worker: ✅ TURN 4 DONE
12:19:28 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:51 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:51 [INFO] eval_worker: ✅ TURN 5 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:19:51 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:51 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:19:51 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=5
12:19:51 [INFO] eval_worker: [TURN] INTERVIEW | turn=5 | scoring_topic=? | covered=none | remaining=1082s | mode=normal | saturation=0% (0.0/4.0)
12:19:51 [INFO] eval_worker: [QA] turn=5  Q: That’s actually a smart call—navigating Meta’s approval process can slow things down a lot. How did you plan your work around that delay?
              A: So I faced there. Yes. It's mostly whenever I face any issues, I use RGBD. Else anything. Then based on that, I'll work out on some other stuff.
12:19:51 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:19:51,427", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=28 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-5"}
12:19:52 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:19:52 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:19:52,789", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=2 specificity=1 grounding=2 | reason=\"It's mostly whenever I face any issues\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-5"}
12:19:52 [INFO] eval_worker: [QUALITY] turn=5 | clarity=3.0 depth=2.0 specificity=1.0 grounding=2.0 | avg=2.00 weighted=1.90 depth_signal=SURFACE
12:19:52 [INFO] eval_worker: [EVAL] turn=5 action=PROBE mode=clarification quality_avg=2.00 signals=[none]
12:19:52 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.90 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:19:52 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:19:52 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:19:52 [INFO] eval_worker: [SATURATION] turn=5 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:19:52 [INFO] eval_worker: [DECISION] turn=5 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:19:52 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=5
12:19:52 [INFO] eval_worker: [RESULT] turn=5  action=PROBE     quality=2.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:19:52 [INFO] eval_worker: [E2E_VERIFY] turn=5 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:19:53 [INFO] eval_worker: [WORKER] ✅ turn=5 action=PROBE overall=2.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1602ms)
12:19:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:19:53 [INFO] eval_worker: ✅ TURN 5 DONE
12:19:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:22 [INFO] eval_worker: ✅ TURN 6 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:20:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:22 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:20:22 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=6
12:20:22 [INFO] eval_worker: [TURN] INTERVIEW | turn=6 | scoring_topic=? | covered=none | remaining=1052s | mode=normal | saturation=0% (0.0/4.0)
12:20:22 [INFO] eval_worker: [QA] turn=6  Q: Hmm, that's a bit broad—what was specifically your approach with RGBD in this context?
              A: No. It's not RGBD. It's chart gbt. It's an open AI model, ChargeGPT. So where I'll work on that, I'll go to ChatGPT, I'll search for this word, the main problem, this word I need to solve. So I'll do
12:20:22 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:20:22,031", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=49 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-7"}
12:20:23 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:20:24 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:20:24,139", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=2 specificity=2 grounding=2 | reason=\"No. It's not RGBD. It's chart gbt. It's an open AI model\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-7"}
12:20:24 [INFO] eval_worker: [QUALITY] turn=6 | clarity=3.0 depth=2.0 specificity=2.0 grounding=2.0 | avg=2.25 weighted=2.20 depth_signal=SURFACE
12:20:24 [INFO] eval_worker: [EVAL] turn=6 action=PROBE mode=clarification quality_avg=2.25 signals=[none]
12:20:24 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:20:24 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:20:24 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:20:24 [INFO] eval_worker: [SATURATION] turn=6 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:20:24 [INFO] eval_worker: [DECISION] turn=6 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:20:24 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=6
12:20:24 [INFO] eval_worker: [RESULT] turn=6  action=PROBE     quality=2.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:20:24 [INFO] eval_worker: [E2E_VERIFY] turn=6 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:20:24 [INFO] eval_worker: [WORKER] ✅ turn=6 action=PROBE overall=2.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2294ms)
12:20:24 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:24 [INFO] eval_worker: ✅ TURN 6 DONE
12:20:24 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:48 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:48 [INFO] eval_worker: ✅ TURN 7 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:20:48 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:48 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:20:48 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=7
12:20:48 [INFO] eval_worker: [TURN] INTERVIEW | turn=7 | scoring_topic=? | covered=none | remaining=1025s | mode=normal | saturation=0% (0.0/4.0)
12:20:48 [INFO] eval_worker: [QA] turn=7  Q: Ah, okay, that makes sense—you used ChatGPT to troubleshoot and find solutions. How did you decide when to switch from waiting on the API approval to focusing on other parts of the project?
              A: figure out all the challenges. No. Like, if everything is good at API, then we'll do testing. If not good, then we'll focus on API.
12:20:48 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:20:48,329", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=25 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-9"}
12:20:49 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:20:49 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:20:50,010", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=4 depth=3 specificity=3 grounding=3 | reason=\"if everything is good at API, then we'll do testing\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-9"}
12:20:50 [INFO] eval_worker: [QUALITY] turn=7 | clarity=4.0 depth=3.0 specificity=3.0 grounding=3.0 | avg=3.25 weighted=3.20 depth_signal=SURFACE
12:20:50 [INFO] eval_worker: [EVAL] turn=7 action=PROBE mode=depth quality_avg=3.25 signals=[example_given]
12:20:50 [INFO] eval_worker: [SIGNAL] name=example_given                layer=behavioral_confidence confidence=0.80 delta=+0.04 turn=7
12:20:50 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=3.20 contribution=0.00 signal_modifier=+0.30 final_contribution=0.30
12:20:50 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.3 (delta=+1.3) | follow_ups: 0 → 1
12:20:50 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.3 < threshold=4.0 (32% done) | need 2.7 more | importance=HIGH
12:20:50 [INFO] eval_worker: [SATURATION] turn=7 | topic=Multi Channel Lead Qualification System | score_1.3_need_2.7 | signals=[example_given]
12:20:50 [INFO] eval_worker: [DECISION] turn=7 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:20:50 [INFO] eval_worker: [DECISION] 🔄 PROBE family=depth signals=[example_given] sat=32% turn=7
12:20:50 [INFO] eval_worker: [RESULT] turn=7  action=PROBE     quality=3.25/SURFACE  signals=[example_given]  saturation=1.3/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:20:50 [INFO] eval_worker: [E2E_VERIFY] turn=7 | PIPELINE_OUTPUT:
  signals_fired    : ['example_given']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (depth)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (DEPTH) ↵ BAND: FRESHER ↵ ANGLE: Push past the claim — get the real number, constraint, or tradeo
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:20:50 [INFO] eval_worker: [WORKER] ✅ turn=7 action=PROBE overall=3.25 sat=1.3/4.0 topic=None→'Multi Channel Lead Qualification System' (1896ms)
12:20:50 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:20:50 [INFO] eval_worker: ✅ TURN 7 DONE
12:20:50 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:21:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:21:22 [INFO] eval_worker: ✅ TURN 8 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:21:22 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:21:22 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:21:22 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=8
12:21:22 [INFO] eval_worker: [TURN] INTERVIEW | turn=8 | scoring_topic=? | covered=none | remaining=991s | mode=normal | saturation=0% (0.0/4.0)
12:21:22 [INFO] eval_worker: [QA] turn=8  Q: Okay, that’s a clear way to prioritize—testing only when the API is ready. What part of the testing process did you personally handle once the API was approved?
              A: Testing, like, giving real messages, sending real messages, and trying how to place being gender Is it, human? Is it, like, a so on so? Feeling like it's an adaptive chat instead of bot chat?
12:21:22 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:21:22,933", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=35 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-11"}
12:21:26 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:21:26,688", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=4 depth=3 specificity=2 grounding=3 | reason='Testing, like, giving real messages, sending real messages'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-11"}
12:21:26 [INFO] eval_worker: [QUALITY] turn=8 | clarity=4.0 depth=3.0 specificity=2.0 grounding=3.0 | avg=3.00 weighted=2.90 depth_signal=SURFACE
12:21:26 [INFO] eval_worker: [EVAL] turn=8 action=PROBE mode=clarification quality_avg=3.00 signals=[none]
12:21:26 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.90 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:21:26 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:21:26 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:21:26 [INFO] eval_worker: [SATURATION] turn=8 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:21:26 [INFO] eval_worker: [DECISION] turn=8 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:21:26 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=8
12:21:26 [INFO] eval_worker: [RESULT] turn=8  action=PROBE     quality=3.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:21:26 [INFO] eval_worker: [E2E_VERIFY] turn=8 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:21:26 [INFO] eval_worker: [WORKER] ✅ turn=8 action=PROBE overall=3.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (4004ms)
12:21:26 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:21:26 [INFO] eval_worker: ✅ TURN 8 DONE
12:21:26 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:01 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:01 [INFO] eval_worker: ✅ TURN 9 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:22:01 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:01 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:22:01 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=9
12:22:01 [INFO] eval_worker: [TURN] INTERVIEW | turn=9 | scoring_topic=? | covered=none | remaining=953s | mode=normal | saturation=0% (0.0/4.0)
12:22:01 [INFO] eval_worker: [QA] turn=9  Q: Got it, so you focused on making the conversation feel natural and human-like during testing. What was one specific change you made to improve that natural feel?
              A: Like, doing testing and giving prompts, like, it has to behave like a giving prompts to make it as a so which totally adaptive part, not as human. Like, we'll train the
12:22:01 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:22:01,033", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=32 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-13"}
12:22:01 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:22:02 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:22:02,680", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=clarification depth_signal=SURFACE | clarity=3 depth=2 specificity=1 grounding=2 | reason='Like, doing testing and giving prompts'", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-13"}
12:22:02 [INFO] eval_worker: [QUALITY] turn=9 | clarity=3.0 depth=2.0 specificity=1.0 grounding=2.0 | avg=2.00 weighted=1.90 depth_signal=SURFACE
12:22:02 [INFO] eval_worker: [EVAL] turn=9 action=PROBE mode=clarification quality_avg=2.00 signals=[none]
12:22:02 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.90 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:22:02 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:22:02 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:22:02 [INFO] eval_worker: [SATURATION] turn=9 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:22:02 [INFO] eval_worker: [DECISION] turn=9 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:22:02 [INFO] eval_worker: [DECISION] 🔄 PROBE family=clarification signals=[none] sat=25% turn=9
12:22:02 [INFO] eval_worker: [RESULT] turn=9  action=PROBE     quality=2.00/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:22:02 [INFO] eval_worker: [E2E_VERIFY] turn=9 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (clarification)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (CLARIFICATION) ↵ BAND: FRESHER ↵ ANGLE: Something isn't adding up — surface it or slow them down
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:22:03 [INFO] eval_worker: [WORKER] ✅ turn=9 action=PROBE overall=2.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2006ms)
12:22:03 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:03 [INFO] eval_worker: ✅ TURN 9 DONE
12:22:03 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:37 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:37 [INFO] eval_worker: ✅ TURN 10 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:22:37 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:37 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:22:37 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=10
12:22:37 [INFO] eval_worker: [TURN] INTERVIEW | turn=10 | scoring_topic=? | covered=none | remaining=916s | mode=normal | saturation=0% (0.0/4.0)
12:22:37 [INFO] eval_worker: [QA] turn=10  Q: That makes sense—you tuned the prompts to make the AI sound more human in its responses. How did you measure or decide that the prompts were effective enough for your lead qualification system?
              A: Based on testing, we'll get to know are they going well or not. So after testing, we'll see for seven days if they are going well, if they are do anything really affect you. If not, we'll retrain the
12:22:37 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:22:37,436", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=40 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-15"}
12:22:38 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:22:38 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:22:38,941", "level": "INFO", "message": "[EVAL] ✅ action=PROBE probe=depth depth_signal=SURFACE | clarity=4 depth=3 specificity=2 grounding=3 | reason=\"after testing, we'll see for seven days\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-15"}
12:22:38 [INFO] eval_worker: [QUALITY] turn=10 | clarity=4.0 depth=3.0 specificity=2.0 grounding=3.0 | avg=3.00 weighted=2.90 depth_signal=SURFACE
12:22:38 [INFO] eval_worker: [EVAL] turn=10 action=PROBE mode=depth quality_avg=3.00 signals=[ownership_ambiguity]
12:22:38 [INFO] eval_worker: [SIGNAL] name=ownership_ambiguity          layer=behavioral_confidence confidence=0.75 delta=-0.15 turn=10
12:22:38 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=2.90 contribution=0.00 signal_modifier=-1.50 final_contribution=0.00
12:22:38 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:22:38 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:22:38 [INFO] eval_worker: [SATURATION] turn=10 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[ownership_ambiguity]
12:22:38 [INFO] eval_worker: [DECISION] turn=10 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:22:38 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[ownership_ambiguity] sat=25% turn=10
12:22:38 [INFO] eval_worker: [RESULT] turn=10  action=PROBE     quality=3.00/SURFACE  signals=[ownership_ambiguity]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:22:38 [INFO] eval_worker: [E2E_VERIFY] turn=10 | PIPELINE_OUTPUT:
  signals_fired    : ['ownership_ambiguity']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:22:39 [INFO] eval_worker: [WORKER] ✅ turn=10 action=PROBE overall=3.00 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1690ms)
12:22:39 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:22:39 [INFO] eval_worker: ✅ TURN 10 DONE
12:22:39 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:04 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:04 [INFO] eval_worker: ✅ TURN 11 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:23:04 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:04 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:23:04 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=11
12:23:04 [INFO] eval_worker: [TURN] INTERVIEW | turn=11 | scoring_topic=? | covered=none | remaining=889s | mode=normal | saturation=0% (0.0/4.0)
12:23:04 [INFO] eval_worker: [QA] turn=11  Q: Okay, so you used a real-time feedback loop over a week to see if the prompts were working well and retrained if needed. That’s a thoughtful approach. What metrics or signals did you track during thos
              A: I didn't do that. team did it.
12:23:04 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:23:04,827", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=7 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-17"}
12:23:05 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:23:06 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:23:06,927", "level": "INFO", "message": "[EVAL] ✅ action=MOVE_ON probe=None depth_signal=SURFACE | clarity=3 depth=1 specificity=1 grounding=1 | reason=\"I didn't do that. team did it.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-17"}
12:23:06 [INFO] eval_worker: [QUALITY] turn=11 | clarity=3.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.50 weighted=1.40 depth_signal=SURFACE
12:23:06 [INFO] eval_worker: [EVAL] turn=11 action=MOVE_ON mode=normal quality_avg=1.50 signals=[none]
12:23:06 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.40 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:23:06 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:23:06 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:23:06 [INFO] eval_worker: [SATURATION] turn=11 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:23:06 [INFO] eval_worker: [DECISION] turn=11 | depth_decay=False weak_exit=False saturated=False action=MOVE_ON
12:23:06 [INFO] eval_worker: [DECISION] ✅ MOVE_ON reason=llm_judge turn=11
12:23:06 [INFO] eval_worker: [SATURATION] MOVE_ON reason=llm_judge → next=Multi Channel Lead Qualification System (importance=HIGH) turn=11
12:23:06 [INFO] eval_worker: [RESULT] turn=11  action=MOVE_ON   quality=1.50/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:23:06 [INFO] eval_worker: [E2E_VERIFY] turn=11 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Multi Channel Lead Qualification System'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Multi Channel Lead Qualification System ↵ YOUR ONLY JOB THIS TURN: Acknowle
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:23:07 [INFO] eval_worker: [WORKER] ✅ turn=11 action=MOVE_ON overall=1.50 sat=0.0/4.0 topic=None→'Multi Channel Lead Qualification System' (2296ms)
12:23:07 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:07 [INFO] eval_worker: ✅ TURN 11 DONE
12:23:07 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:31 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:31 [INFO] eval_worker: ✅ TURN 12 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:23:31 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:31 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:23:31 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=12
12:23:31 [INFO] eval_worker: [TURN] INTERVIEW | turn=12 | scoring_topic=? | covered=none | remaining=863s | mode=normal | saturation=0% (0.0/4.0)
12:23:31 [INFO] eval_worker: [QA] turn=12  Q: I appreciate that, thanks for being straight with me. What was your role in coordinating or communicating with the team during that testing and feedback period?
              A: No. And it's not a good feedback, but okay. We are done.
12:23:31 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
{"timestamp": "2026-05-31 12:23:31,233", "level": "INFO", "message": "[EVAL] ▶ merged evaluate_answer | model=gpt-4.1-mini words=12 follow_ups=0", "logger": "interview-agent", "module": "agent_scoring", "line": 87, "taskName": "Task-19"}
12:23:31 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:23:32 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
{"timestamp": "2026-05-31 12:23:32,501", "level": "INFO", "message": "[EVAL] ✅ action=MOVE_ON probe=None depth_signal=SURFACE | clarity=2 depth=1 specificity=1 grounding=1 | reason=\"No. And it's not a good feedback, but okay.\"", "logger": "interview-agent", "module": "agent_scoring", "line": 254, "taskName": "Task-19"}
12:23:32 [INFO] eval_worker: [QUALITY] turn=12 | clarity=2.0 depth=1.0 specificity=1.0 grounding=1.0 | avg=1.25 weighted=1.20 depth_signal=SURFACE
12:23:32 [INFO] eval_worker: [EVAL] turn=12 action=MOVE_ON mode=normal quality_avg=1.25 signals=[ownership_ambiguity, example_evasion]
12:23:32 [INFO] eval_worker: [SIGNAL] name=ownership_ambiguity          layer=behavioral_confidence confidence=0.72 delta=-0.15 turn=12
12:23:32 [INFO] eval_worker: [SIGNAL] name=example_evasion              layer=behavioral_confidence confidence=0.70 delta=-0.15 turn=12
12:23:32 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=1.20 contribution=0.00 signal_modifier=-3.00 final_contribution=0.00
12:23:32 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:23:32 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:23:32 [INFO] eval_worker: [SATURATION] turn=12 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[ownership_ambiguity, example_evasion]
12:23:32 [INFO] eval_worker: [DECISION] turn=12 | depth_decay=False weak_exit=False saturated=False action=MOVE_ON
12:23:32 [INFO] eval_worker: [DECISION] ✅ MOVE_ON reason=llm_judge turn=12
12:23:32 [INFO] eval_worker: [SATURATION] MOVE_ON reason=llm_judge → next=Multi Channel Lead Qualification System (importance=HIGH) turn=12
12:23:32 [INFO] eval_worker: [RESULT] turn=12  action=MOVE_ON   quality=1.25/SURFACE  signals=[ownership_ambiguity, example_evasion]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:23:32 [INFO] eval_worker: [E2E_VERIFY] turn=12 | PIPELINE_OUTPUT:
  signals_fired    : ['ownership_ambiguity', 'example_evasion']
  action_decided   : MOVE_ON
  EXPECTED_BEHAVIOR: move to next topic 'Multi Channel Lead Qualification System'
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Multi Channel Lead Qualification System ↵ YOUR ONLY JOB THIS TURN: Acknowle
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:23:32 [INFO] eval_worker: [WORKER] ✅ turn=12 action=MOVE_ON overall=1.25 sat=0.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1592ms)
12:23:32 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:32 [INFO] eval_worker: ✅ TURN 12 DONE
12:23:32 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:52 [INFO] eval_worker: ✅ TURN 13 STARTED | app_id=app-vamsi-resume-gtm-cmps7cu-8541
12:23:52 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:52 [INFO] eval_worker: [TOPIC_BOOT] active_topic empty — next_uncovered=Multi Channel Lead Qualification System (resume_topics=5 skill_topics=5 covered=0)
12:23:52 [INFO] eval_worker: [TOPIC_BOOT] ✅ BOOTSTRAPPED | topic='Multi Channel Lead Qualification System' source=resume importance=HIGH band=fresher | threshold=4.0 base_credit=1.0 turn=13
12:23:52 [INFO] eval_worker: [TURN] INTERVIEW | turn=13 | scoring_topic=? | covered=none | remaining=842s | mode=normal | saturation=0% (0.0/4.0)
12:23:52 [INFO] eval_worker: [QA] turn=13  Q: Thanks for being honest about that. Let’s talk about your Sensex Analysis Project—what was the most interesting insight you uncovered from the market data you analyzed?
              A: I do that project.
12:23:52 [INFO] eval_worker: [EVAL_PIPELINE] Step2/Topics: uncovered_next=Multi Channel Lead Qualification System | discussed_log=0 entries
12:23:53 [INFO] httpx: HTTP Request: POST https://api.openai.com/v1/chat/completions "HTTP/1.1 200 OK"
12:23:53 [INFO] eval_worker: [QUALITY] turn=13 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20 depth_signal=SURFACE
12:23:53 [INFO] eval_worker: [EVAL] turn=13 action=PROBE mode=ownership quality_avg=0.25 signals=[none]
12:23:53 [INFO] eval_worker: [SAT_CALC] topic=Multi Channel Lead Qualification System | response_score=0.20 contribution=0.00 signal_modifier=+0.00 final_contribution=0.00
12:23:53 [INFO] eval_worker: [SAT_CALC] base_credit=1.0 | score: 0.0 → 1.0 (delta=+1.0) | follow_ups: 0 → 1
12:23:53 [INFO] eval_worker: [SAT_RESULT] 🔄 NOT SATURATED | score=1.0 < threshold=4.0 (25% done) | need 3.0 more | importance=HIGH
12:23:53 [INFO] eval_worker: [SATURATION] turn=13 | topic=Multi Channel Lead Qualification System | score_1.0_need_3.0 | signals=[none]
12:23:53 [INFO] eval_worker: [DECISION] turn=13 | depth_decay=False weak_exit=False saturated=False action=PROBE
12:23:53 [INFO] eval_worker: [DECISION] 🔄 PROBE family=ownership signals=[none] sat=25% turn=13
12:23:53 [INFO] eval_worker: [RESULT] turn=13  action=PROBE     quality=0.25/SURFACE  signals=[none]  saturation=1.0/4.0  probe_index=0
         next=Multi Channel Lead Qualification System             covered=none
12:23:53 [INFO] eval_worker: [E2E_VERIFY] turn=13 | PIPELINE_OUTPUT:
  signals_fired    : ['none']
  action_decided   : PROBE
  EXPECTED_BEHAVIOR: probe deeper on 'Multi Channel Lead Qualification System' (ownership)
  directive_injected: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: PROBE (OWNERSHIP) ↵ BAND: FRESHER ↵ ANGLE: Find out what was specifically theirs and how they actually
  topic_after      : Multi Channel Lead Qualification System (was: ?)
  covered_topics   : 0 total
12:23:53 [INFO] eval_worker: [WORKER] ✅ turn=13 action=PROBE overall=0.25 sat=1.0/4.0 topic=None→'Multi Channel Lead Qualification System' (1097ms)
12:23:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
12:23:53 [INFO] eval_worker: ✅ TURN 13 DONE
12:23:53 [INFO] eval_worker: ────────────────────────────────────────────────────────────
