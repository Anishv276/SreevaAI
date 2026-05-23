from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
start = text.index('const PROCTORING_DISPLAY: Record<string, { title: string; why: string; risk: string }> = {')
end = text.index('\n};\n\nfunction buildIntegritySignals(', start)
new_block = '''const PROCTORING_DISPLAY: Record<string, { title: string; why: string; risk: string }> = {
  face_absence: { title: "Face not visible", why: "Camera detected no face during the interview. The candidate may have looked away, turned off the camera, or left the frame.", risk: "High - indicates the candidate was not actively present in front of the camera." },
  multiple_faces: { title: "Multiple faces detected", why: "More than one person was detected in the camera frame, suggesting someone else may have been present or assisting.", risk: "High - potential coaching or collaboration violation." },
  identity_mismatch: { title: "Identity mismatch", why: "The face detected during the interview did not consistently match the registered identity of the candidate.", risk: "High - possible impersonation attempt. Verify with candidate photo ID." },
  camera_disabled: { title: "Camera disabled mid-session", why: "The candidate turned off the camera during a live interview segment, breaking proctoring visibility.", risk: "High - prevents visual monitoring of the candidate." },
  microphone_disabled: { title: "Microphone disabled mid-session", why: "The microphone was turned off during the interview, disrupting audio capture and transcription quality.", risk: "Medium - may affect transcript accuracy; review recording for gaps." },
  tab_switch: { title: "Tab / app switch", why: "The candidate switched away from the interview tab to another browser tab or application. This is commonly associated with looking up answers.", risk: "Medium - cross-check with answer quality; sudden improvement after a tab switch is a red flag." },
  duplicate_ip_simultaneous: { title: "Simultaneous device match", why: "Two interviews were detected from the same device at overlapping times, strongly suggesting the same person or device was used.", risk: "High - strong indicator of proxy use or organised sharing." },
  duplicate_ip_sequential: { title: "Sequential device reuse", why: "The same device IP was used by another candidate in a separate session, suggesting the device was shared or resold.", risk: "Medium - lower risk but worth flagging if candidate profiles are similar." },
  duplicate_ip_network: { title: "Shared network only", why: "The candidate shares a network with another interviewee, such as a campus or office network. This alone is not a violation.", risk: "Low - context dependent; common in campus or agency settings." },
  connection_lost: { title: "Connection dropped", why: "The candidate's internet connection was interrupted during the session. This may be genuine or deliberate.", risk: "Low-Medium - check whether audio and video resumed cleanly and whether answers were affected." },
};'''
text = text[:start] + new_block + text[end:]
path.write_text(text, encoding="utf-8")
