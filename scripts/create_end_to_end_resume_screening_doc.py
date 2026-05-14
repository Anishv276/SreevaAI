from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/omprakashreddy/Desktop/Sreeva/HR")
OUT = ROOT / "end_to_end_resume_screening_guide.docx"


def set_run_font(run, font_name: str, size: int | None = None, bold: bool | None = None, color: str | None = None):
    run.font.name = font_name
    run._element.rPr.rFonts.set(qn("w:ascii"), font_name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), font_name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = RGBColor.from_string(color.replace("#", ""))


def set_style_font(style, font_name: str, size: int, color: str = "000000", bold: bool = False):
    style.font.name = font_name
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.color.rgb = RGBColor.from_string(color.replace("#", ""))
    style._element.rPr.rFonts.set(qn("w:ascii"), font_name)
    style._element.rPr.rFonts.set(qn("w:hAnsi"), font_name)


def apply_body_paragraph_format(paragraph, after_pt: int = 8, line_multiple: float = 1.15):
    fmt = paragraph.paragraph_format
    fmt.space_after = Pt(after_pt)
    fmt.space_before = Pt(0)
    fmt.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    fmt.line_spacing = line_multiple


def add_paragraph(doc: Document, text: str, *, bold_prefix: str | None = None, style: str = "Normal"):
    p = doc.add_paragraph(style=style)
    if bold_prefix and text.startswith(bold_prefix):
        run = p.add_run(bold_prefix)
        set_run_font(run, "Arial", 11, bold=True)
        rest = text[len(bold_prefix):]
        if rest:
            run2 = p.add_run(rest)
            set_run_font(run2, "Arial", 11)
    else:
        run = p.add_run(text)
        set_run_font(run, "Arial", 11)
    apply_body_paragraph_format(p)
    return p


def add_bullet(doc: Document, text: str):
    p = doc.add_paragraph(style="List Bullet")
    run = p.add_run(text)
    set_run_font(run, "Arial", 11)
    fmt = p.paragraph_format
    fmt.space_after = Pt(4)
    fmt.space_before = Pt(0)
    fmt.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    fmt.line_spacing = 1.15
    return p


def add_heading(doc: Document, text: str, level: int):
    p = doc.add_paragraph(style=f"Heading {level}")
    run = p.add_run(text)
    set_run_font(run, "Arial", {1: 16, 2: 14, 3: 12}[level], bold=True)
    p.paragraph_format.space_before = Pt({1: 18, 2: 14, 3: 10}[level])
    p.paragraph_format.space_after = Pt({1: 8, 2: 6, 3: 4}[level])
    return p


def configure_styles(doc: Document):
    styles = doc.styles
    normal = styles["Normal"]
    set_style_font(normal, "Arial", 11, color="000000")
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    normal.paragraph_format.line_spacing = 1.15

    title = styles["Title"]
    set_style_font(title, "Arial", 24, color="000000", bold=True)
    title.paragraph_format.space_after = Pt(10)
    title.paragraph_format.space_before = Pt(0)

    for name, size in [("Heading 1", 16), ("Heading 2", 14), ("Heading 3", 12)]:
        st = styles[name]
        set_style_font(st, "Arial", size, color="000000", bold=True)

    for list_name in ["List Bullet", "List Number"]:
        if list_name in styles:
            st = styles[list_name]
            set_style_font(st, "Arial", 11, color="000000")
            st.paragraph_format.space_after = Pt(4)
            st.paragraph_format.space_before = Pt(0)
            st.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
            st.paragraph_format.line_spacing = 1.15


def main():
    doc = Document()
    configure_styles(doc)

    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    # Title block
    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run("How the Resume Screening System Works End to End")
    set_run_font(run, "Arial", 24, bold=True)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = subtitle.add_run(
        "A plain-English guide to how the job description is cleaned up, how resumes are extracted, how the database is used, "
        "and how the final candidate report is written."
    )
    set_run_font(run, "Arial", 11, color="555555")
    apply_body_paragraph_format(subtitle, after_pt=10)

    add_paragraph(
        doc,
        "The short version: the system turns a job description and a resume into structured information, saves it in the database, "
        "and then uses that saved information to score the candidate and explain the result. A second human-like layer then rereads "
        "the same evidence the way a recruiter would: by looking at proof, relevance, and how close the experience is to the job."
    )

    add_heading(doc, "The end-to-end flow in one line", 1)
    flow = doc.add_paragraph()
    flow_run = flow.add_run("Job description -> cleaned JD data -> database -> resume extraction -> score -> candidate report -> human-like review")
    set_run_font(flow_run, "Arial", 11, bold=True)
    apply_body_paragraph_format(flow, after_pt=10)

    add_heading(doc, "1. The job description is optimized first", 1)
    add_paragraph(
        doc,
        "When a job description is uploaded, the system does not just keep the text as-is. It reads the description and turns it into structured fields "
        "that are easier for the scoring engine to compare against resumes."
    )
    add_bullet(doc, "It identifies the must-have skills, responsibilities, experience requirements, and domain clues.")
    add_bullet(doc, "It converts skill names into consistent, canonical names so small wording differences do not break the match.")
    add_bullet(doc, "It adds scoring hints such as what would make a candidate stand out, and what should count as a warning sign.")
    add_bullet(doc, "It normalizes the weights so the same job description is scored fairly every time.")
    add_paragraph(
        doc,
        "Why this matters: if the job description is unclear or messy, every candidate is affected. That is why this step is carefully optimized before the data is saved."
    )

    add_heading(doc, "2. The resume is extracted into evidence", 1)
    add_paragraph(
        doc,
        "When a candidate uploads a resume, the system reads the text and converts it into structured evidence. This is the difference between a simple keyword scan "
        "and an actual screening system."
    )
    add_bullet(doc, "It pulls out work history, projects, education, skills, dates, and measurable outcomes.")
    add_bullet(doc, "It tries to record what the candidate actually did, not just what they listed in a skills section.")
    add_bullet(doc, "It tags each skill or tool by source strength, so work experience counts more than a simple list item.")
    add_bullet(doc, "It records evidence items such as: built something, improved something, reduced something, or owned something.")
    add_paragraph(
        doc,
        "Why this matters: the scoring engine cannot judge the resume well unless the resume has been turned into structured proof. A strong resume is one where the system can see "
        "both the skill and the evidence behind that skill."
    )

    add_heading(doc, "3. The database becomes the source of truth", 1)
    add_paragraph(
        doc,
        "After extraction, both the job description and the resume are stored in the database in a structured form. From that point on, the database becomes the source of truth."
    )
    add_bullet(doc, "The saved JD is reused for every candidate for that role.")
    add_bullet(doc, "The saved resume data is reused for scoring, reporting, and review screens.")
    add_bullet(doc, "This avoids rescanning the same files every time someone opens a candidate profile.")
    add_bullet(doc, "If the JD or resume extraction improves later, the system can rescan and update the stored structured data.")
    add_paragraph(
        doc,
        "Why this matters: the database makes the screening process consistent. Everyone sees the same saved facts instead of a fresh guess every time."
    )

    add_heading(doc, "4. The candidate report is built from the saved data", 1)
    add_paragraph(
        doc,
        "When someone opens a candidate, the app reads the stored JD and resume data and creates a report. The report is not just a score. It is a readable explanation of why the candidate did or did not fit the role."
    )
    add_bullet(doc, "The deterministic scoring engine compares the stored JD against the stored resume.")
    add_bullet(doc, "The app shows matched skills, partial matches, missing skills, experience fit, and domain fit.")
    add_bullet(doc, "The report also includes strengths, risks, suggested interview questions, and a short recruiter-style summary.")
    add_bullet(doc, "The score and explanation come from the same structured evidence, so the result is consistent and traceable.")
    add_paragraph(
        doc,
        "Why this matters: hiring teams need more than a number. They need to know why the number is what it is."
    )

    add_heading(doc, "5. The human-like thinking layer adds recruiter judgment", 1)
    add_paragraph(
        doc,
        "This is the second layer you asked for. It does not replace the rule-based score. It rereads the same evidence with recruiter judgment."
    )
    add_bullet(doc, "Direct work experience is weighted more than a simple skill list.")
    add_bullet(doc, "Close, relevant experience can receive partial credit, especially for junior or intern roles.")
    add_bullet(doc, "A candidate who used a skill in a real job is treated better than a candidate who only mentioned it once.")
    add_bullet(doc, "Measurable outcomes matter more than vague statements.")
    add_bullet(doc, "Missing a word does not automatically hurt the candidate if the same idea is clearly proven another way.")
    add_paragraph(
        doc,
        "A simple example: if the JD asks for Spring Boot and the resume shows Java, REST APIs, and backend internship work, the human-like layer may still give credit because a recruiter would see that as close enough for an entry-level role. But if there is no evidence at all, it does not invent credit."
    )

    add_heading(doc, "What the human-like layer is trying to do", 2)
    add_bullet(doc, "Reward real proof instead of keyword stuffing.")
    add_bullet(doc, "Treat adjacent experience fairly when the role is junior or internship-level.")
    add_bullet(doc, "Avoid over-penalizing a candidate for a single missing buzzword when the overall evidence is strong.")
    add_bullet(doc, "Still stay honest: no proof means no points.")

    add_heading(doc, "What it does not do", 2)
    add_bullet(doc, "It does not guess from names, college prestige, gender, or nationality.")
    add_bullet(doc, "It does not give points just because a resume sounds impressive.")
    add_bullet(doc, "It does not rewrite the evidence; it only interprets the evidence already there.")
    add_bullet(doc, "It does not turn a weak resume into a strong one.")

    add_heading(doc, "Plain-English glossary", 1)
    add_paragraph(doc, "Job description (JD): the written list of what the role needs and what the person should be able to do.")
    add_paragraph(doc, "Structured data: organized information that a computer can compare consistently, instead of raw unstructured text.")
    add_paragraph(doc, "Evidence item: one concrete thing the candidate actually did, built, owned, or improved.")
    add_paragraph(doc, "Source of truth: the saved database record that the system trusts when scoring and reporting.")
    add_paragraph(doc, "Human-like layer: a second pass that thinks more like a recruiter by looking at the quality and closeness of the evidence.")

    add_heading(doc, "Final takeaway", 1)
    add_paragraph(
        doc,
        "In short, the system works like this: it cleans up the job description, extracts the resume into proof, stores both in the database, "
        "scores the candidate against the saved job requirements, and then adds a recruiter-style second pass so the result feels more like human judgment."
    )

    doc.save(OUT)


if __name__ == "__main__":
    main()
