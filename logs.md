PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python agent.py dev
    11:39:15.109 DEBUG    asyncio            Using proactor: IocpProactor
    11:39:15.124 DEV      livekit.agents     Watching C:\Users\vamsi\OneDrive\Desktop\HR-updates
    11:40:26.009 DEBUG    asyncio            Using proactor: IocpProactor
    11:40:26.050 INFO     livekit.agents     starting worker {"version": "1.5.10", "rtc-version": "1.1.8"}
    11:40:26.055 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.cartesia", "version": "1.5.10"}
    11:40:26.061 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.deepgram", "version": "1.5.10"}
    11:40:26.066 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.openai", "version": "1.5.10"}
    11:40:26.072 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.sarvam", "version": "1.5.10"}
    11:40:26.075 INFO     livekit.agents     plugin registered {"plugin": "livekit.plugins.silero", "version": "1.5.10"}
    11:40:26.079 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.elevenlabs", "version": "1.5.10"}
    11:40:26.088 INFO     livekit.agents     HTTP server listening on :64822
    11:40:26.101 INFO     livekit.agents     initializing job runner {"tid": 26636}
{"timestamp": "2026-06-01 11:40:26,106", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 402, "taskName": null}
{"timestamp": "2026-06-01 11:40:26,483", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 405, "taskName": null}
{"timestamp": "2026-06-01 11:40:26,483", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-06-01 11:40:26,484", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 413, "taskName": null}
{"timestamp": "2026-06-01 11:40:26,484", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 418, "taskName": null}
{"timestamp": "2026-06-01 11:40:26,484", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 433, "taskName": null}
    11:40:26.485 INFO     livekit.agents     job runner initialized {"tid": 26636, "elapsed_time": 0.38}
    11:40:26.488 DEBUG    asyncio            Using proactor: IocpProactor
    11:40:26.719 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id": "AW_h8fDdRixsuGM", "url":
"wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India South", "protocol": 17}
    11:49:19.099 INFO     livekit.agents     received job request
                                         {"job_id": "AJ_NTqttq5FcqM2", "dispatch_id": "AD_pmVjJJmm4UdE", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "room_id": "RM_J8Ldr3VXVQ2f", "agent_name": "ai_interviewer", "resuming":
false, "enable_recording": false}
    11:49:19.157 DEBUG    livekit.agents     received assignment
                                         {"agent_name": "ai_interviewer", "room_id": "RM_J8Ldr3VXVQ2f", "room":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "job_id": "AJ_NTqttq5FcqM2", "dispatch_id": "AD_pmVjJJmm4UdE",
"enable_recording": false}
{"timestamp": "2026-06-01 11:49:19,177", "level": "INFO", "message": "Connecting to room interview_app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_runtime", "line": 515, "taskName": "job_user_entrypoint"}
{"timestamp": "2026-06-01 11:49:19,179", "level": "INFO", "message": "[SESSION] interview context loaded", "logger": "interview-agent", "module": "agent_runtime", "line": 570, "taskName": "job_user_entrypoint", "event": "session_start", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:19.251 INFO     livekit.agents     initializing job runner {"tid": 26576}
{"timestamp": "2026-06-01 11:49:19,257", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 402, "taskName": null}
{"timestamp": "2026-06-01 11:49:19,724", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 405, "taskName": null}
{"timestamp": "2026-06-01 11:49:19,735", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": null}
{"timestamp": "2026-06-01 11:49:19,736", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 413, "taskName": null}
{"timestamp": "2026-06-01 11:49:19,740", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 418, "taskName": null}
{"timestamp": "2026-06-01 11:49:19,741", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 433, "taskName": null}
    11:49:19.743 DEBUG    asyncio            Using proactor: IocpProactor
    11:49:19.748 INFO     livekit.agents     job runner initialized {"tid": 26576, "elapsed_time": 0.49}
{"timestamp": "2026-06-01 11:49:20,388", "level": "INFO", "message": "[STARTUP] Fetched  resume=YES jd=YES custom_q=0 | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 693, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,389", "level": "INFO", "message": "[STARTUP] Custom questions: NONE configured", "logger": "interview-agent", "module": "agent_runtime", "line": 708, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,389", "level": "INFO", "message": "[FLOW] Custom questions  none configured", "logger": "interview-agent", "module": "agent_runtime", "line": 716, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,391", "level": "INFO", "message": "[FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM engineer", "logger": "interview-agent", "module": "agent_runtime", "line": 774, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,393", "level": "INFO", "message": "[INTERVIEW_CONTEXT]\nCANDIDATE: Vadla Vamsi Krishna | ROLE: GTM engineer | BAND: fresher | TIME: 20m\n\nFETCH SUMMARY:\n  Resume: fetched | JD: fetched | Custom Q: 0\n  JD Must-Have Skills: none\n  JD Nice-To-Have: none\n  Coverage Targets: python, ai, datascience, powerbi, n8n, zapier, Multi Channel Lead Qualification System, Sensex Analysis Project\n\nRESUME BRIEF:\n  Anchor: Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website] (type: project)\n  Skills: python, ai, datascience, powerbi, n8n\n  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System\n  Work History: Personal Brand & Marketing Automation Strategist | Python Developer\n  Internships: none\n  Education: B.Tech | MPC\n\nINTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. Open with: 'Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. [Instagram, Facebook, website]'. Band=fresher: probe HOW they think  real decisions, specifics, learning signals. Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural.", "logger": "interview-agent", "module": "agent_runtime", "line": 854, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,400", "level": "INFO", "message": "[FLOW] System prompt ready  greeting  warmup  interview", "logger": "interview-agent", "module": "agent_runtime", "line": 880, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,401", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3-general language=en-US diarization=True ep_ms=800", "logger": "interview-agent", "module": "agent_providers", "line": 734, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,402", "level": "INFO", "message": "[TTS] Using SARVAM  voice=priya model=bulbul:v3", "logger": "interview-agent", "module": "agent_runtime", "line": 890, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:20,402", "level": "INFO", "message": "[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en voice=priya api_key_len=36", "logger": "interview-agent", "module": "agent_providers", "line": 613, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:21,583", "level": "INFO", "message": "[FLOW] Greeting precomputed during launching phase", "logger": "interview-agent", "module": "agent_runtime", "line": 918, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:22.175 DEBUG    livekit.agents     input stream attached
                                         {"participant": null, "source": "SOURCE_UNKNOWN", "accepted_sources":
["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:49:22.181 INFO     livekit.agents     adaptive interruption detector initialized
                                         {"base_url": "https://agent-gateway.livekit.cloud/v1", "detection_interval":
0.1, "audio_prefix_duration": 1.0, "max_audio_duration": 3, "min_frames": 2, "threshold": 0.5, "inference_timeout": 0.7,
"use_proxy": true, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:49:22.188 DEBUG    livekit.agents     http_session(): creating a new httpclient ctx
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:49:22.198 DEBUG    livekit.agents     using audio io: `RoomIO` -> `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:49:22.203 DEBUG    livekit.agents     using transcript io: `AgentSession` -> `TranscriptSynchronizer` ->
                                             `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:49:22,209", "level": "INFO", "message": "[FLOW] launch_prereqs_ready signal sent to frontend", "logger": "interview-agent", "module": "agent_runtime", "line": 1164, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,209", "level": "INFO", "message": "[FLOW] Session started  candidate=Vadla Vamsi Krishna role=GTM engineer band=fresher tts=SARVAM llm=gpt-4.1-mini boot=3032ms", "logger": "interview-agent", "module": "agent_runtime", "line": 2243, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,210", "level": "INFO", "message": "[FLOW] Greeting started  20-min interview timer begins NOW", "logger": "interview-agent", "module": "agent_runtime", "line": 2258, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:22.213 DEBUG    livekit.agents     start reading stream
                                         {"participant": "candidate_app-vamsi-resume-gtm-cmps7cu-8541", "source":
"SOURCE_MICROPHONE", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:49:22,225", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=7fae58ce4590 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,228", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the G T M engineer role. How are you doing? Hope the day's been good to you.\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-68", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,229", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 360, "taskName": "Task-68", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,467", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmps7cu-8541 marked as IN_PROGRESS.", "logger": "interview-agent", "module": "agent_persistence", "line": 1088, "taskName": "Task-59", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:22,570", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=7fae58ce4590 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:23.051 DEBUG    livekit.agents     aec warmup active, disabling interruptions for 0.50s
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:49:23,055", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2162, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:23.213 DEBUG    livekit.….deepgram Established new Deepgram STT WebSocket connection:
                                           {"headers": {"dg-project-id": "9ac4806b-a6d5-44a5-bf62-c3c6bbfc33e1",
"dg-request-id": "019e81d6-4434-7281-9f26-c79ae6e6df06", "Date": "Mon, 01 Jun 2026 06:19:23 GMT"}, "session_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541", "room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna",
"candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:49:23.560 DEBUG    livekit.agents     aec warmup expired, re-enabling interruptions
                                         {"session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:49:27,877", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=7fae58ce4590 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:27,885", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=7fae58ce4590 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:27,967", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=7fae58ce4590 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,138", "level": "DEBUG", "message": "Transcript: Interviewer[10]: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM engineer role. How are you doing? Hope the day's been good to you.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 194, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,139", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=0 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1953, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,139", "level": "INFO", "message": "âœ… TURN 1 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1973, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,140", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2160, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,140", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2182, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,142", "level": "INFO", "message": "[TRANSCRIPT] Greeting appended to transcript (session.say bypass)", "logger": "interview-agent", "module": "agent_runtime", "line": 2280, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,143", "level": "INFO", "message": "[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)", "logger": "interview-agent", "module": "agent_runtime", "line": 2281, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,144", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2160, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:33,146", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started after greeting delivery", "logger": "interview-agent", "module": "agent_runtime", "line": 2326, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:35,062", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2162, "taskName": "Task-46", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:49:38.355 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. It's good. How about you?", "language": "en-US",
"transcript_delay": 1.9900915622711182, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"dispatch_application_id": "app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmps7cu-8541", "org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location":
"Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi Krishna", "candidate_first_name":
"Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:49:38,379", "level": "DEBUG", "message": "[LLM_GATE] cleared at entry (interview turn) — waiting for eval", "logger": "interview-agent", "module": "agent_runtime", "line": 266, "taskName": "Task-193", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,387", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 fragment #1: 'Yeah. It's good. How about you?...' (consolidated: 'Yeah. It's good. How about you?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2019, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,388", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 - debounce 0.30s (is_complete=True, words=6)", "logger": "interview-agent", "module": "agent_runtime", "line": 2121, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,400", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=e153249bd945 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,694", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=1 - 1 fragments  complete utterance (sentence_complete): 'Yeah. It's good. How about you?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2067, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,695", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing greeting replay (turn already processed): 'Yeah. It's good. How about you?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1419, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:38,708", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=e153249bd945 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:53,381", "level": "WARNING", "message": "[LLM_GATE] timed out (15s) — generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-193", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:53,383", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 302, "taskName": "Task-193", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:53,384", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 311, "taskName": "Task-193", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:58,172", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"I'm doing well, thanks for asking! Are you ready to get started with our conversation?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-204", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:58,173", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 360, "taskName": "Task-204", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:58,584", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2162, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:49:58,714", "level": "DEBUG", "message": "[TTS_SARVAM_WS_KEEPALIVE] request_id=e153249bd945 ping_sent", "logger": "interview-agent", "module": "agent_providers", "line": 475, "taskName": "SarvamDirectSynthesizeStream.keepalive", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:00,277", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=e153249bd945 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 382, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:00,279", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=e153249bd945 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 509, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:00,339", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=e153249bd945 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 557, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:02,347", "level": "DEBUG", "message": "Transcript: Interviewer[40]: I'm doing well, thanks for asking! Are you ready to get started with our conversation?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 206, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:02,347", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=1 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 1953, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:02,348", "level": "INFO", "message": "âœ… TURN 2 | phase=warmup", "logger": "interview-agent", "module": "agent_runtime", "line": 1973, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:02,348", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2160, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:02,349", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2182, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:04,508", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2162, "taskName": "Task-46", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
    11:50:05.364 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0 -> 2.0
                                         {"reason": "new turn", "pause": 22.249780654907227, "max_delay": 2.0,
"min_delay": 0.8, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
    11:50:06.494 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah.", "language": "en-US", "transcript_delay":
1.6747949123382568, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541", "app_id": "app-vamsi-resume-gtm-cmps7cu-8541",
"room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_application_id":
"app-vamsi-resume-gtm-cmps7cu-8541", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM
engineer", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmps7cu-8541",
"org_id": "org-vamsi-8494", "org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM engineer", "time_limit_mins": 20}
{"timestamp": "2026-06-01 11:50:06,504", "level": "DEBUG", "message": "[LLM_GATE] cleared at entry (interview turn) — waiting for eval", "logger": "interview-agent", "module": "agent_runtime", "line": 266, "taskName": "Task-310", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,508", "level": "INFO", "message": "[WARMUP]  WARMUP COMPLETE at turn=2  INTERVIEW PHASE ACTIVE", "logger": "interview-agent", "module": "agent_runtime", "line": 2001, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,509", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 fragment #1: 'Yeah....' (consolidated: 'Yeah....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2019, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,510", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 - debounce 0.30s (is_complete=True, words=1)", "logger": "interview-agent", "module": "agent_runtime", "line": 2121, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,519", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=90104a65a269 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 170, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,816", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=2 - 1 fragments  complete utterance (sentence_complete): 'Yeah....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2067, "taskName": "Task-327", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,817", "level": "DEBUG", "message": "Transcript: Candidate[44]: Yeah.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 206, "taskName": "Task-327", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,818", "level": "INFO", "message": "[EVAL_GATE] turn=2 â†’ BLOCK(warmup=True,turn=2>2=False,question=Y)", "logger": "interview-agent", "module": "agent_runtime", "line": 1568, "taskName": "Task-327", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,933", "level": "INFO", "message": "[TRANSCRIPT] Partial save 3 lines, 44s, 1 turn(s) for app-vamsi-resume-gtm-cmps7cu-8541", "logger": "interview-agent", "module": "agent_persistence", "line": 1053, "taskName": "Task-328", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:06,940", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=90104a65a269 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 22050, 'temperature': 0.4, 'output_audio_bitrate': '64k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 233, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:21,506", "level": "WARNING", "message": "[LLM_GATE] timed out (15s) — generating anyway", "logger": "interview-agent", "module": "agent_runtime", "line": 274, "taskName": "Task-310", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:21,507", "level": "INFO", "message": "[LLM_GATE] timeout | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 302, "taskName": "Task-310", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:21,508", "level": "INFO", "message": "[TEMP] role=greeting_rapport_closing temperature=0.75", "logger": "interview-agent", "module": "agent_runtime", "line": 311, "taskName": "Task-310", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:23,707", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: 'Thanks for that. You mentioned creating automated lead capture across Instagram, Facebook, website, and email in your Multi Channel Lead Qualification System, which platform did you find the most challenging to integrate, and why?'", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-321", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:23,707", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 360, "taskName": "Task-321", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:24,119", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2162, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:26,942", "level": "DEBUG", "message": "[TTS_SARVAM_WS_KEEPALIVE] request_id=90104a65a269 ping_sent", "logger": "interview-agent", "module": "agent_providers", "line": 475, "taskName": "SarvamDirectSynthesizeStream.keepalive", "session_id": "app-vamsi-resume-gtm-cmps7cu-8541"}
{"timestamp": "2026-06-01 11:50:30,281", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=90104a65a269 mod