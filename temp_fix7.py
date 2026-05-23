# -*- coding: utf-8 -*-
from pathlib import Path
path = Path(r"components/admin/candidate-profile/interview-report-sreevaai.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace('    const handledIcon = isHandled ? "a"" : isPartial ? "a-\'" : "a-";', '    const handledIcon = isHandled ? "YES" : isPartial ? "PARTIAL" : "NO";')
text = text.replace('  tab_switch:      { label: "Tab / App switch",    what: "Candidate switched away from the interview window a" could indicate looking up answers or distraction." },', '  tab_switch:      { label: "Tab / App switch",    what: "Candidate switched away from the interview window. This could indicate looking up answers or distraction." },')
text = text.replace('  face_absence:    { label: "Face not visible",    what: "Camera detected no face in the frame a" candidate may have moved away, turned off camera, or left the desk." },', '  face_absence:    { label: "Face not visible",    what: "Camera detected no face in the frame. The candidate may have moved away, turned off camera, or left the desk." },')
text = text.replace('  multiple_faces:  { label: "Multiple faces",      what: "More than one person visible in the camera a" possible coaching or external assistance." },', '  multiple_faces:  { label: "Multiple faces",      what: "More than one person visible in the camera frame. Possible coaching or external assistance." },')
path.write_text(text, encoding="utf-8")
