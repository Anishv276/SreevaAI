 "line": 403, "taskName": null}
    17:22:48.089 DEBUG    asyncio            Using proactor: IocpProactor
    17:22:48.092 INFO     livekit.agents     job runner initialized
                                         {"tid": 30668, "elapsed_time": 0.27}
    17:22:48.353 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id":
"AW_LroFr3vrKEZX", "url": "wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India
South", "protocol": 17}
    17:23:04.349 DEBUG    asyncio            Using proactor: IocpProactor
    17:23:04.370 INFO     livekit.agents     starting worker
                                         {"version": "1.5.10", "rtc-version": "1.1.8"}
    17:23:04.373 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.cartesia", "version":
"1.5.10"}
    17:23:04.376 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.deepgram", "version":
"1.5.10"}
    17:23:04.379 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.openai", "version":
"1.5.10"}
    17:23:04.381 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.sarvam", "version":
"1.5.10"}
    17:23:04.384 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.silero", "version":
"1.5.10"}
    17:23:04.387 INFO     livekit.agents     plugin registered
                                         {"plugin": "livekit.plugins.elevenlabs", "version":
"1.5.10"}
    17:23:04.392 INFO     livekit.agents     HTTP server listening on :63640
    17:23:04.398 INFO     livekit.agents     initializing job runner {"tid": 20528}
{"timestamp": "2026-05-29 17:23:04,401", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 372, "taskName": null}
{"timestamp": "2026-05-29 17:23:04,629", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 375, "taskName": null}
{"timestamp": "2026-05-29 17:23:04,630", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 717, "taskName": null}
{"timestamp": "2026-05-29 17:23:04,630", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 383, "taskName": null}
{"timestamp": "2026-05-29 17:23:04,631", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 388, "taskName": null}
{"timestamp": "2026-05-29 17:23:04,631", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 403, "taskName": null}
    17:23:04.632 DEBUG    asyncio            Using proactor: IocpProactor
    17:23:04.634 INFO     livekit.agents     job runner initialized
                                         {"tid": 20528, "elapsed_time": 0.23}
    17:23:04.894 INFO     livekit.agents     registered worker
                                         {"agent_name": "ai_interviewer", "id":
"AW_gE6bZA2vCni4", "url": "wss://interview-system-3bnh6c3s.livekit.cloud", "region": "India
South", "protocol": 17}
    17:25:16.427 INFO     livekit.agents     received job request
                                         {"job_id": "AJ_wGz5qQDxkxWj", "dispatch_id":
"AD_ZYJ7eVT7FgTM", "room": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "room_id":
"RM_uz2JH7trXFjo", "agent_name": "ai_interviewer", "resuming": false, "enable_recording": false}
    17:25:16.481 DEBUG    livekit.agents     received assignment
                                         {"agent_name": "ai_interviewer", "room_id":
"RM_uz2JH7trXFjo", "room": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "job_id":
"AJ_wGz5qQDxkxWj", "dispatch_id": "AD_ZYJ7eVT7FgTM", "enable_recording": false}
{"timestamp": "2026-05-29 17:25:16,489", "level": "INFO", "message": "Connecting to room interview_app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_runtime", "line": 484, "taskName": "job_user_entrypoint"}
{"timestamp": "2026-05-29 17:25:16,489", "level": "INFO", "message": "[SESSION] interview context loaded", "logger": "interview-agent", "module": "agent_runtime", "line": 539, "taskName": "job_user_entrypoint", "event": "session_start", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20, "dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:16.548 INFO     livekit.agents     initializing job runner {"tid": 3792}
{"timestamp": "2026-05-29 17:25:16,551", "level": "INFO", "message": "Prewarming worker process...", "logger": "interview-agent", "module": "agent_runtime", "line": 372, "taskName": null}
{"timestamp": "2026-05-29 17:25:16,752", "level": "INFO", "message": "VAD model prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 375, "taskName": null}
{"timestamp": "2026-05-29 17:25:16,754", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3 language=en diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 717, "taskName": null}
{"timestamp": "2026-05-29 17:25:16,755", "level": "INFO", "message": "Default STT prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 383, "taskName": null}
{"timestamp": "2026-05-29 17:25:16,756", "level": "INFO", "message": "Default TTS prewarmed.", "logger": "interview-agent", "module": "agent_runtime", "line": 388, "taskName": null}
{"timestamp": "2026-05-29 17:25:16,756", "level": "INFO", "message": "No running event loop in prewarm; DB pool will initialize lazily.", "logger": "interview-agent", "module": "agent_runtime", "line": 403, "taskName": null}
    17:25:16.759 DEBUG    asyncio            Using proactor: IocpProactor
    17:25:16.763 INFO     livekit.agents     job runner initialized
                                         {"tid": 3792, "elapsed_time": 0.21}
{"timestamp": "2026-05-29 17:25:17,378", "level": "INFO", "message": "[STARTUP] Fetched  resume=YES jd=YES custom_q=0 | candidate=Vadla Vamsi Krishna | role=GTM Engineer (Fresher)", "logger": "interview-agent", "module": "agent_runtime", "line": 614, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,378", "level": "INFO", "message": "[STARTUP] JD keys  must_have=['build and manage outreach systems (LinkedIn, Email, WhatsApp)', 'set up and optimize lead generation workflows', 'n8n', 'Zapier', 'analyze campaign performance and improve conversions', 'support in building AI-driven sales and marketing systems'] nice_to_have=[]", "logger": "interview-agent", "module": "agent_runtime", "line": 622, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,379", "level": "INFO", "message": "[STARTUP] Custom questions: NONE configured", "logger": "interview-agent", "module": "agent_runtime", "line": 629, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,379", "level": "INFO", "message": "[FLOW] Custom questions  none configured", "logger": "interview-agent", "module": "agent_runtime", "line": 637, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,380", "level": "INFO", "message": "[FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM Engineer (Fresher)", "logger": "interview-agent", "module": "agent_runtime", "line": 695, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,381", "level": "INFO", "message": "[INTERVIEW_CONTEXT]\nCANDIDATE: Vadla Vamsi Krishna | ROLE: GTM Engineer (Fresher) | BAND: fresher | TIME: 20m\n\nFETCH SUMMARY:\n  Resume: fetched | JD: fetched | Custom Q: 0\n  JD Must-Have Skills: build and manage outreach systems (LinkedIn, Email, WhatsApp), set up and optimize lead generation workflows, n8n, Zapier, analyze campaign performance and improve conversions, support in building AI-driven sales and marketing systems\n  JD Nice-To-Have: none\n  Coverage Targets: python, datascience, ai, n8n, Power BI, Zapier, Multi Channel Lead Qualification System, Sensex Analysis Project\n\nRESUME BRIEF:\n  Anchor: Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow. (type: project)\n  Skills: python, datascience, ai, n8n, Power BI\n  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System\n  Work History: Personal Brand & Marketing Automation Strategist | Python Developer\n  Internships: none\n  Education: B.Tech | MPC\n\nINTERVIEW PLAN: 20 min covering resume ownership, JD skills, situational, behavioural. Open with: 'Multi Channel Lead Qualification System - Created automated lead capture across Instagram, Facebook, website, and email; built logic to qualify leads and trigger booking reminders for hot prospects; unified all inbound sources into a single workflow.'. Band=fresher: probe HOW they think  real decisions, specifics, learning signals. Must cover: resume projects, work history, JD must-have skills, at least 1 situational, at least 1 behavioural.", "logger": "interview-agent", "module": "agent_runtime", "line": 775, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,386", "level": "INFO", "message": "[FLOW] System prompt ready  greeting  warmup  interview", "logger": "interview-agent", "module": "agent_runtime", "line": 801, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,387", "level": "INFO", "message": "[STT] Deepgram config: model=nova-3-general language=en-US diarization=True ep_ms=500", "logger": "interview-agent", "module": "agent_providers", "line": 717, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,387", "level": "INFO", "message": "[TTS] Using SARVAM  voice=priya model=bulbul:v3", "logger": "interview-agent", "module": "agent_runtime", "line": 811, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:17,387", "level": "INFO", "message": "[SARVAM_TTS] Initializing TTS: model=bulbul:v3 language=en voice=priya api_key_len=36", "logger": "interview-agent", "module": "agent_providers", "line": 598, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,347", "level": "INFO", "message": "[FLOW] Greeting precomputed during launching phase", "logger": "interview-agent", "module": "agent_runtime", "line": 839, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:18.352 DEBUG    livekit.agents     input stream attached
                                         {"participant": null, "source": "SOURCE_UNKNOWN",
"accepted_sources": ["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:18.359 INFO     livekit.agents     adaptive interruption detector initialized
                                         {"base_url": "https://agent-gateway.livekit.cloud/v1",
"detection_interval": 0.1, "audio_prefix_duration": 1.0, "max_audio_duration": 3, "min_frames":
2, "threshold": 0.5, "inference_timeout": 0.7, "use_proxy": true, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:18.366 DEBUG    livekit.agents     http_session(): creating a new httpclient ctx
                                         {"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:18.374 DEBUG    livekit.agents     using audio io: `RoomIO` -> `AgentSession` ->
                                             `TranscriptSynchronizer` -> `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:18.378 DEBUG    livekit.agents     using transcript io: `AgentSession` ->
                                             `TranscriptSynchronizer` -> `RoomIO`
                                         {"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:18.382 DEBUG    livekit.agents     start reading stream
                                         {"participant":
"candidate_app-vamsi-resume-gtm-cmpqj6w-3535", "source": "SOURCE_MICROPHONE", "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:25:18,385", "level": "INFO", "message": "[FLOW] launch_prereqs_ready signal sent to frontend", "logger": "interview-agent", "module": "agent_runtime", "line": 1010, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,385", "level": "INFO", "message": "[FLOW] Session started  candidate=Vadla Vamsi Krishna role=GTM Engineer (Fresher) band=fresher tts=SARVAM llm=gpt-4.1-mini boot=1896ms", "logger": "interview-agent", "module": "agent_runtime", "line": 2495, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,385", "level": "INFO", "message": "[FLOW] Greeting started  20-min interview timer begins NOW", "logger": "interview-agent", "module": "agent_runtime", "line": 2510, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,393", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=200456d4cb9e model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 159, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,396", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the G T M Engineer (Fresher) role. How are you doing? Hope the day's been good to you.\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,397", "level": "INFO", "message": "[TTS] Streamed 4 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 330, "taskName": "Task-69", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,576", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmpqj6w-3535 marked as IN_PROGRESS.", "logger": "interview-agent", "module": "agent_persistence", "line": 921, "taskName": "Task-62", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,628", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,700", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=200456d4cb9e payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 24000, 'temperature': 0.4, 'output_audio_bitrate': '128k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 222, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:18,744", "level": "INFO", "message": "[REDIS_EVAL] Redis eval client connected and ping OK  redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768", "logger": "interview-agent", "module": "agent_runtime", "line": 959, "taskName": "Task-35", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:19.091 DEBUG    livekit.agents     aec warmup active, disabling interruptions for
                                             0.50s
                                         {"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:25:19,093", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:19.288 DEBUG    livekit.….deepgram Established new Deepgram STT WebSocket
                                             connection:
                                           {"headers": {"dg-project-id":
"9ac4806b-a6d5-44a5-bf62-c3c6bbfc33e1", "dg-request-id": "019e7396-cb2a-7751-a7a9-4c98350e1354",
"Date": "Fri, 29 May 2026 11:55:22 GMT"}, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:19.592 DEBUG    livekit.agents     aec warmup expired, re-enabling interruptions
                                         {"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:25:24,368", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=200456d4cb9e model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 367, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:24,368", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=200456d4cb9e model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 494, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:24,418", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=200456d4cb9e close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 542, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,183", "level": "DEBUG", "message": "Transcript: Interviewer[11]: Hi Vamsi, really glad we could connect today. I'm Ishitha, and I've been looking forward to our conversation about the GTM Engineer (Fresher) role. How are you doing? Hope the day's been good to you.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 189, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,184", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=0 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 2215, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,184", "level": "INFO", "message": "✅ TURN 1 | warmup=False", "logger": "interview-agent", "module": "agent_runtime", "line": 2235, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,184", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,185", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2434, "taskName": "AgentActivity.tts_say", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,186", "level": "INFO", "message": "[TRANSCRIPT] Greeting appended to transcript (session.say bypass)", "logger": "interview-agent", "module": "agent_runtime", "line": 2532, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,187", "level": "INFO", "message": "[FLOW]  GREETING DONE  WARMUP ACTIVE (waiting for warmup Q&A before interview)", "logger": "interview-agent", "module": "agent_runtime", "line": 2533, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,188", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:30,188", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started after greeting delivery", "logger": "interview-agent", "module": "agent_runtime", "line": 2578, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:31,782", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:33.681 DEBUG    livekit.agents     min endpointing delay updated: 0.5 ->
                                             1.75122697353363
                                         {"reason": "pause between utterances", "pause":
13.012269735336304, "max_delay": 2.0, "min_delay": 1.75122697353363, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:34.424 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. Yeah. It's good. How about
you?", "language": "en-US", "transcript_delay": 1.2449884414672852, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:25:34,935", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 267, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:34,936", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 273, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:34,936", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.45", "logger": "interview-agent", "module": "agent_runtime", "line": 281, "taskName": "Task-200", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,054", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 2277, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,055", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 fragment #1: 'Yeah. Yeah. It's good. How about you?...' (consolidated: 'Yeah. Yeah. It's good. How about you?...')", "logger": "interview-agent", "module": "agent_runtime", "line": 2286, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,055", "level": "DEBUG", "message": "[STT_BUFFER] turn=1 - debounce 0.30s (is_complete=True, words=7)", "logger": "interview-agent", "module": "agent_runtime", "line": 2373, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,071", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=fdb8d985ecdd model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 159, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,312", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=fdb8d985ecdd payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 24000, 'temperature': 0.4, 'output_audio_bitrate': '128k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 222, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,369", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=1 - 1 fragments  complete utterance (sentence_complete): 'Yeah. Yeah. It's good. How about you?...'", "logger": "interview-agent", "module": "agent_runtime", "line": 2319, "taskName": "Task-217", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:36,369", "level": "DEBUG", "message": "[TRANSCRIPT] Suppressing greeting replay (turn already processed): 'Yeah. It's good. How about you?'", "logger": "interview-agent", "module": "agent_runtime", "line": 1227, "taskName": "Task-217", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:37,854", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Thanks for sharing that, Vamsi, sounds like a busy day! Just making sure you're comfortable and ready, all good on your end?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:37,855", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 330, "taskName": "Task-211", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:38,173", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:40,986", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=fdb8d985ecdd model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 367, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:40,987", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=fdb8d985ecdd model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 494, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:41,036", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=fdb8d985ecdd close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 542, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:44,295", "level": "DEBUG", "message": "Transcript: Interviewer[25]: Thanks for sharing that, Vamsi — sounds like a busy day! Just making sure you're comfortable and ready — all good on your end?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:44,295", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=1 skipped (greeting/warmup phase)", "logger": "interview-agent", "module": "agent_runtime", "line": 2215, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:44,296", "level": "INFO", "message": "✅ TURN 2 | warmup=False", "logger": "interview-agent", "module": "agent_runtime", "line": 2235, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:44,296", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:44,296", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2434, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:45,728", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:25:47.281 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0
                                             -> 2.0
                                         {"reason": "new turn", "pause": 5.06774640083313,
"max_delay": 2.0, "min_delay": 1.75122697353363, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:25:50.039 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "Yeah. Everything is good.",
"language": "en-US", "transcript_delay": 3.3103346824645996, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:25:50,048", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 267, "taskName": "Task-317", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,049", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 273, "taskName": "Task-317", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,049", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.45", "logger": "interview-agent", "module": "agent_runtime", "line": 281, "taskName": "Task-317", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,058", "level": "INFO", "message": "[WARMUP]  WARMUP COMPLETE at turn=2  INTERVIEW PHASE ACTIVE", "logger": "interview-agent", "module": "agent_runtime", "line": 2263, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,060", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 warmup — skipping _directive_ready.clear()", "logger": "interview-agent", "module": "agent_runtime", "line": 2277, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,061", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 fragment #1: 'Yeah. Everything is good....' (consolidated: 'Yeah. Everything is good....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2286, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,061", "level": "DEBUG", "message": "[STT_BUFFER] turn=2 - debounce 0.30s (is_complete=True, words=4)", "logger": "interview-agent", "module": "agent_runtime", "line": 2373, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,070", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=688c5a2adc68 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 159, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,321", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=688c5a2adc68 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 24000, 'temperature': 0.4, 'output_audio_bitrate': '128k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 222, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,363", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=2 - 1 fragments  complete utterance (sentence_complete): 'Yeah. Everything is good....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2319, "taskName": "Task-335", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,364", "level": "DEBUG", "message": "Transcript: Candidate[31]: Yeah. Everything is good.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-335", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,364", "level": "INFO", "message": "[EVAL_GATE] turn=2 → BLOCK(warmup=True,turn=2>2=False,question=Y,redis=Y)", "logger": "interview-agent", "module": "agent_runtime", "line": 1362, "taskName": "Task-335", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:50,476", "level": "INFO", "message": "[TRANSCRIPT] Partial save 3 lines, 31s duration, 1 turn(s) for app app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-336", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:51,888", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Perfect, let's dive in! To start, I'd love to hear about the Multi Channel Lead Qualification System you worked on. What did you personally build or own in that project?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-328", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:51,888", "level": "INFO", "message": "[TTS] Streamed 3 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 330, "taskName": "Task-328", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:52,276", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:57,135", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=688c5a2adc68 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 367, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:57,135", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=688c5a2adc68 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 494, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:25:57,197", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=688c5a2adc68 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 542, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,526", "level": "DEBUG", "message": "Transcript: Interviewer[44]: Perfect, let's dive in! To start, I'd love to hear about the Multi Channel Lead Qualification System you worked on. What did you personally build or own in that project?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,527", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=2 last_q='What did you personally build or own in that project?'", "logger": "interview-agent", "module": "agent_runtime", "line": 2186, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,527", "level": "INFO", "message": "[PHASE_STATUS] Opening question sealed: 'What did you personally build or own in that project?'", "logger": "interview-agent", "module": "agent_runtime", "line": 2204, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,528", "level": "INFO", "message": "[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)", "logger": "interview-agent", "module": "agent_runtime", "line": 2213, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,528", "level": "INFO", "message": "✅ TURN 3 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2235, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,528", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:02,529", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2434, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:04,033", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:26:06.831 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I did everything on my own.",
"language": "en-US", "transcript_delay": 0.002790212631225586, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:26:07.379 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0
                                             -> 2.0
                                         {"reason": "new turn", "pause": 5.569796085357666,
"max_delay": 2.0, "min_delay": 1.75122697353363, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:26:08.428 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "So it's my personal project.",
"language": "en-US", "transcript_delay": 1.600281000137329, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:26:08,583", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 fragment #1: 'I did everything on my own. So it's my personal pr...' (consolidated: 'I did everything on my own. So it's my personal project....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2286, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,585", "level": "DEBUG", "message": "[STT_BUFFER] turn=3 - debounce 0.30s (is_complete=True, words=11)", "logger": "interview-agent", "module": "agent_runtime", "line": 2373, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,591", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=99a442ad4169 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 159, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,832", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=99a442ad4169 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 24000, 'temperature': 0.4, 'output_audio_bitrate': '128k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 222, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,888", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=3 - 1 fragments  complete utterance (sentence_complete): 'I did everything on my own. So it's my personal project....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2319, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,888", "level": "DEBUG", "message": "Transcript: Candidate[50]: I did everything on own. So it's personal project.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,890", "level": "INFO", "message": "[EVAL_GATE] turn=3 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1362, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,891", "level": "INFO", "message": "[SYNC_GATE] turn=3 | first eval turn — no prior result to fetch, skipping pubsub", "logger": "interview-agent", "module": "agent_runtime", "line": 1965, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,892", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=3 to eval_worker | answer=\"I did everything on own. So it's personal project.\" | question=\"Perfect, let's dive in! To start, I'd love to hear about the\" | active_topic=None | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2116, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,893", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 267, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,893", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 273, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,893", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.45", "logger": "interview-agent", "module": "agent_runtime", "line": 281, "taskName": "Task-465", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:08,983", "level": "INFO", "message": "[TRANSCRIPT] Partial save 5 lines, 50s duration, 2 turn(s) for app app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-481", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:09,142", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=3 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1904, "taskName": "Task-480", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:10,351", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Got it, you handled the whole project solo, that's impressive. Can you walk me through one specific part you built in that system and how you decided to approach it?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-476", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:10,351", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 330, "taskName": "Task-476", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:10,672", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:15,301", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=99a442ad4169 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 367, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:15,302", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=99a442ad4169 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 494, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:15,351", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=99a442ad4169 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 542, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:20,464", "level": "DEBUG", "message": "Transcript: Interviewer[62]: Got it, you handled the whole project solo — that's impressive. Can you walk me through one specific part you built in that system and how you decided to approach it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:20,465", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=3 last_q='Can you walk me through one specific part you built in that '", "logger": "interview-agent", "module": "agent_runtime", "line": 2186, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:20,465", "level": "INFO", "message": "✅ TURN 4 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2235, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:20,466", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:20,466", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2434, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:22,683", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:26:24.429 DEBUG    livekit.agents     max endpointing delay updated due to pause: 2.0
                                             -> 2.0
                                         {"reason": "new turn", "pause": 3.8681867122650146,
"max_delay": 2.0, "min_delay": 1.75122697353363, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:26:24,733", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:26:26.033 DEBUG    livekit.agents     min endpointing delay updated: 1.75122697353363
                                             -> 1.657638208866119
                                         {"reason": "pause between utterances", "pause":
0.8153393268585205, "max_delay": 2.0, "min_delay": 1.657638208866119, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:26:26,343", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": "Task-47", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:26:26.678 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "I did everything on my own. It's
not anything like", "language": "en-US", "transcript_delay": 0.047593116760253906, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:26:27.379 DEBUG    livekit.agents     min endpointing delay updated: 1.657638208866119
                                             -> 1.5739767343997952
                                         {"reason": "pause between utterances", "pause":
0.8210234642028809, "max_delay": 2.0, "min_delay": 1.5739767343997952, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:26:28.133 DEBUG    livekit.agents     received user transcript
                                         {"user_transcript": "personal.", "language": "en-US",
"transcript_delay": 1.3049273490905762, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535",
"app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:26:28,405", "level": "INFO", "message": "[LLM_GATE] ✅ directive ready", "logger": "interview-agent", "module": "agent_runtime", "line": 267, "taskName": "Task-617", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,405", "level": "INFO", "message": "[LLM_GATE] on-time | sys_msgs=4", "logger": "interview-agent", "module": "agent_runtime", "line": 273, "taskName": "Task-617", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,405", "level": "INFO", "message": "[TEMP] role=interview_normal temperature=0.45", "logger": "interview-agent", "module": "agent_runtime", "line": 281, "taskName": "Task-617", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,410", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 fragment #1: 'I did everything on my own. It's not anything like...' (consolidated: 'I did everything on my own. It's not anything like personal....')", "logger": "interview-agent", "module": "agent_runtime", "line": 2286, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,411", "level": "DEBUG", "message": "[STT_BUFFER] turn=4 - debounce 0.30s (is_complete=True, words=11)", "logger": "interview-agent", "module": "agent_runtime", "line": 2373, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,414", "level": "INFO", "message": "[TTS_SARVAM_WS_START] request_id=d21028f47189 model=bulbul:v3 speaker=priya language=en-IN ws_url=wss://api.sarvam.ai/text-to-speech/ws", "logger": "interview-agent", "module": "agent_providers", "line": 159, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,653", "level": "DEBUG", "message": "[TTS_SARVAM_WS_CONFIG] request_id=d21028f47189 payload={'type': 'config', 'data': {'target_language_code': 'en-IN', 'speaker': 'priya', 'pace': 1.2, 'model': 'bulbul:v3', 'speech_sample_rate': 24000, 'temperature': 0.4, 'output_audio_bitrate': '128k', 'min_buffer_size': 30, 'max_chunk_length': 150, 'output_audio_codec': 'mp3'}}", "logger": "interview-agent", "module": "agent_providers", "line": 222, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,715", "level": "INFO", "message": "[STT_CONSOLIDATED] turn=4 - 1 fragments  complete utterance (sentence_complete): 'I did everything on my own. It's not anything like personal....'", "logger": "interview-agent", "module": "agent_runtime", "line": 2319, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,716", "level": "DEBUG", "message": "Transcript: Candidate[70]: I did everything on own. It's not anything like personal.", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,717", "level": "INFO", "message": "[EVAL_GATE] turn=4 → PASS", "logger": "interview-agent", "module": "agent_runtime", "line": 1362, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,718", "level": "INFO", "message": "[SYNC_GATE] turn=4 | subscribing for eval result of turn=3 (max 4.5s)...", "logger": "interview-agent", "module": "agent_runtime", "line": 1984, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:28,818", "level": "INFO", "message": "[TRANSCRIPT] Partial save 7 lines, 70s duration, 3 turn(s) for app app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 833, "taskName": "Task-633", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:29,860", "level": "DEBUG", "message": "[TTS_FINAL] Text sent to TTS: \"Got it, you handled the whole project solo, that's impressive. Can you walk me through one specific part you built in that system and how you decided to approach it?\"", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 90, "taskName": "Task-628", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:29,860", "level": "INFO", "message": "[TTS] Streamed 2 sentence(s) via WebSocket", "logger": "interview-agent", "module": "agent_runtime", "line": 330, "taskName": "Task-628", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:30,187", "level": "DEBUG", "message": "[NUDGE] Inactivity clock cleared", "logger": "interview-agent", "module": "agent_runtime", "line": 2414, "taskName": null, "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:31,117", "level": "INFO", "message": "[TIMER] remaining=1127s turn=4", "logger": "interview-agent", "module": "agent_runtime", "line": 2633, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:33,644", "level": "WARNING", "message": "[SYNC_GATE] turn=4 | pubsub error: ", "logger": "interview-agent", "module": "agent_runtime", "line": 2056, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,146", "level": "WARNING", "message": "[SYNC_GATE] ⏰ turn=4 | timeout 4.5s — clearing stale directives before releasing LLM", "logger": "interview-agent", "module": "agent_runtime", "line": 2097, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,146", "level": "INFO", "message": "[EVAL_DISPATCH] Pushing turn=4 to eval_worker | answer=\"I did everything on own. It's not anything like personal.\" | question=\"Got it, you handled the whole project solo — that's impressi\" | active_topic=None | topic_state_score=0.0", "logger": "interview-agent", "module": "agent_runtime", "line": 2116, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,446", "level": "INFO", "message": "[REDIS_EVAL] Pushed payload turn=4 to worker queue", "logger": "interview-agent", "module": "agent_runtime", "line": 1904, "taskName": "Task-632", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,682", "level": "INFO", "message": "[TTS_SARVAM_WS_FINAL] request_id=d21028f47189 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 367, "taskName": "SarvamDirectSynthesizeStream.recv", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,682", "level": "INFO", "message": "[TTS_SARVAM_WS_DONE] request_id=d21028f47189 model=bulbul:v3 speaker=priya", "logger": "interview-agent", "module": "agent_providers", "line": 494, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:34,729", "level": "INFO", "message": "[TTS_SARVAM_WS_CLOSED] request_id=d21028f47189 close_code=1000", "logger": "interview-agent", "module": "agent_providers", "line": 542, "taskName": "TTS._main_task", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:39,868", "level": "DEBUG", "message": "Transcript: Interviewer[81]: Got it, you handled the whole project solo — that's impressive. Can you walk me through one specific part you built in that system and how you decided to approach it?", "logger": "interview-agent", "module": "agent_runtime_helpers", "line": 201, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:39,871", "level": "DEBUG", "message": "[QUESTION_TRACK] turn=4 last_q='Can you walk me through one specific part you built in that '", "logger": "interview-agent", "module": "agent_runtime", "line": 2186, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:39,872", "level": "INFO", "message": "✅ TURN 5 | warmup=True", "logger": "interview-agent", "module": "agent_runtime", "line": 2235, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:39,874", "level": "DEBUG", "message": "[NUDGE] Inactivity clock started (awaiting candidate response)", "logger": "interview-agent", "module": "agent_runtime", "line": 2412, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:39,876", "level": "DEBUG", "message": "[NUDGE] AI finished speaking; starting inactivity countdown", "logger": "interview-agent", "module": "agent_runtime", "line": 2434, "taskName": "AgentActivity.pipeline_reply", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:40,369", "level": "INFO", "message": "Candidate participant disconnected", "logger": "interview-agent", "module": "agent_runtime", "line": 1087, "taskName": "Task-33", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:26:40.374 DEBUG    livekit.agents     stream closed
                                         {"participant":
"candidate_app-vamsi-resume-gtm-cmpqj6w-3535", "source": "SOURCE_MICROPHONE", "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
{"timestamp": "2026-05-29 17:26:46,196", "level": "INFO", "message": "Interview ended (finished=False, time_expired=False). Waiting 2s for final transcripts...", "logger": "interview-agent", "module": "agent_runtime", "line": 2813, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,209", "level": "INFO", "message": "[TRUST] Final  score=0.675 integrity=high quality=adequate trend=stable recommendation=ADVANCE_WITH_NOTE", "logger": "interview-agent", "module": "agent_runtime", "line": 2833, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,209", "level": "INFO", "message": "[PERSIST] Saving final transcript (8 lines) and scores (0 turns)", "logger": "interview-agent", "module": "agent_runtime", "line": 2840, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,308", "level": "INFO", "message": "[TRANSCRIPT] Final save 8 lines, 89s duration, 4 turn(s), status=COMPLETED for app app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 859, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,355", "level": "INFO", "message": "[PERSIST] Transcript and scores saved", "logger": "interview-agent", "module": "agent_runtime", "line": 2918, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,356", "level": "INFO", "message": "[SKILL_RATINGS] No skill ratings to persist", "logger": "interview-agent", "module": "agent_runtime", "line": 2913, "taskName": "Task-743", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:48,655", "level": "INFO", "message": "[USAGE] Saved LiveKit usage for org org-vamsi-2336 (llm=24902 tokens, stt=66.14999999999988s audio, tts=0s audio; billingInterviewCost~$0.0047)", "logger": "interview-agent", "module": "agent_persistence", "line": 581, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:49,158", "level": "INFO", "message": "[SUMMARY] Generating narrative summary for app-vamsi-resume-gtm-cmpqj6w-3535...", "logger": "interview-agent", "module": "agent_persistence", "line": 1138, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:51,507", "level": "INFO", "message": "[SUMMARY] Generated summary for app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 1188, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:52,469", "level": "INFO", "message": "[REPORT] Generating report for app-vamsi-resume-gtm-cmpqj6w-3535 technical=0 communication=0 interview_turns=0", "logger": "interview-agent", "module": "agent_persistence", "line": 1241, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:59,231", "level": "INFO", "message": "[REPORT] Generated skill report for app-vamsi-resume-gtm-cmpqj6w-3535: score=0, skills=0", "logger": "interview-agent", "module": "agent_persistence", "line": 1531, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:59,468", "level": "INFO", "message": "[USAGE] Saved interview billing snapshot for app-vamsi-resume-gtm-cmpqj6w-3535", "logger": "interview-agent", "module": "agent_persistence", "line": 696, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:59,795", "level": "INFO", "message": "[USAGE] Flushed 2 manual billing entries for org-vamsi-2336", "logger": "interview-agent", "module": "agent_persistence", "line": 491, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:26:59,981", "level": "INFO", "message": "[INTERVIEW] App app-vamsi-resume-gtm-cmpqj6w-3535 marked as COMPLETED.", "logger": "interview-agent", "module": "agent_persistence", "line": 1114, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:27:00,402", "level": "INFO", "message": "[BILLING] Deducted 1 quota + 1.69 credits for app-vamsi-resume-gtm-cmpqj6w-3535 org=org-vamsi-2336 dur=101s", "logger": "interview-agent", "module": "agent_persistence", "line": 1087, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:27:10,546", "level": "WARNING", "message": "[SYNC_ERROR] Failed to notify sync engine: timed out", "logger": "interview-agent", "module": "agent_scoring", "line": 383, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
{"timestamp": "2026-05-29 17:27:10,546", "level": "INFO", "message": "Final save complete. Closing job process.", "logger": "interview-agent", "module": "agent_runtime", "line": 2993, "taskName": "job_user_entrypoint", "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535"}
    17:27:10.547 DEBUG    livekit.agents     input stream detached
                                         {"participant":
"candidate_app-vamsi-resume-gtm-cmpqj6w-3535", "source": "SOURCE_UNKNOWN", "accepted_sources":
["SOURCE_MICROPHONE"], "session_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "app_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name":
"Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi
Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)",
"time_limit_mins": 20}
    17:27:12.619 DEBUG    livekit.agents     session closed
                                         {"reason": "user_initiated", "error": null,
"session_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "app_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535",
"dispatch_application_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name":
"Vadla Vamsi Krishna", "dispatch_role_label": "GTM Engineer (Fresher)",
"dispatch_time_limit_mins": 20, "dispatch_room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336", "org_name": "Vamsi",
"org_location": "Bengaluru, Karnataka, India", "drive_location": "", "candidate": "Vadla Vamsi
Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer (Fresher)",
"time_limit_mins": 20}
    17:27:42.542 WARNING  livekit            livekit_api::signal_client:530:livekit_api::sign…
                                             - dropping pass-through signal — no stream
                                             available
    17:27:42.557 DEBUG    livekit.agents     shutting down job task
                                         {"reason": "", "user_initiated": false, "session_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "app_id": "app-vamsi-resume-gtm-cmpqj6w-3535", "room_name":
"interview_app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_application_id":
"app-vamsi-resume-gtm-cmpqj6w-3535", "dispatch_candidate_name": "Vadla Vamsi Krishna",
"dispatch_role_label": "GTM Engineer (Fresher)", "dispatch_time_limit_mins": 20,
"dispatch_room_name": "interview_app-vamsi-resume-gtm-cmpqj6w-3535", "org_id": "org-vamsi-2336",
"org_name": "Vamsi", "org_location": "Bengaluru, Karnataka, India", "drive_location": "",
"candidate": "Vadla Vamsi Krishna", "candidate_first_name": "Vamsi", "job_title": "GTM Engineer
(Fresher)", "time_limit_mins": 20}
    17:27:42.566 DEBUG    livekit.agents     job exiting
                                         {"reason": "", "tid": 20528, "job_id":
"AJ_wGz5qQDxkxWj", "room_id": "RM_uz2JH7trXFjo"}
{"timestamp": "2026-05-29 17:27:42,570", "level": "INFO", "message": "[SESSION] shutdown  elapsed=145.2s", "logger": "interview-agent", "module": "agent_runtime", "line": 657, "taskName": "job_shutdown_callback"}
{"timestamp": "2026-05-29 17:27:42,571", "level": "DEBUG", "message": "[SESSION] reset_log_context skipped due to cross-context token", "logger": "interview-agent", "module": "agent_runtime_support", "line": 105, "taskName": "job_shutdown_callback"}
    17:27:42.574 DEBUG    livekit.agents     http_session(): closing the httpclient ctx



worker:
PS C:\Users\vamsi\OneDrive\Desktop\HR-updates> python -m interview.eval_worker
17:22:21 [INFO] eval_worker: [WORKER] Started — redis=redis://default:P9UPxXC2OiUbueeGPoGdcNYUlchnr4FW@31.97.60.216:32768 queue=interview:eval_queue


