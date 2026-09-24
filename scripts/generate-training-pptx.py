"""
Generate PEERPoint role training decks with speaker notes + voice narration.

Requires:
  - screenshots in docs/training/screenshots/ (optional but recommended)
  - edge-tts (pip)
  - Microsoft PowerPoint (for embedding audio via COM)

Usage:
  python scripts/generate-training-pptx.py
  python scripts/generate-training-pptx.py --narrate
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import time
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "training"
SHOT_DIR = OUT_DIR / "screenshots"
AUDIO_DIR = OUT_DIR / "narration"
PUBLIC_DOCS = ROOT / "apps" / "pwa" / "public" / "docs"

# More natural Microsoft neural voice (male)
TTS_VOICE = "en-US-BrianNeural"
TTS_RATE = "-8%"  # slightly slower = more conversational
TTS_PITCH = "+0Hz"

GREEN = RGBColor(0x0F, 0x6A, 0x4A)
GREEN_DARK = RGBColor(0x0A, 0x45, 0x32)
GOLD = RGBColor(0xB4, 0x53, 0x09)
CREAM = RGBColor(0xF6, 0xFA, 0xF7)
INK = RGBColor(0x1A, 0x2E, 0x28)
MUTED = RGBColor(0x4A, 0x5C, 0x56)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)


def _set_run(run, text: str, size: int, bold: bool = False, color: RGBColor = INK) -> None:
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = "Calibri"


def _add_bg(slide, prs: Presentation, color: RGBColor = CREAM) -> None:
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), prs.slide_width, prs.slide_height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def _add_header_bar(slide, prs: Presentation, title: str, eyebrow: str) -> None:
    bar = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), prs.slide_width, Inches(1.05)
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = GREEN
    bar.line.fill.background()

    accent = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(1.05), prs.slide_width, Inches(0.07)
    )
    accent.fill.solid()
    accent.fill.fore_color.rgb = GOLD
    accent.line.fill.background()

    box = slide.shapes.add_textbox(Inches(0.45), Inches(0.16), Inches(12.2), Inches(0.85))
    tf = box.text_frame
    tf.word_wrap = True
    p0 = tf.paragraphs[0]
    r0 = p0.add_run()
    _set_run(r0, eyebrow.upper(), 11, True, WHITE)
    p1 = tf.add_paragraph()
    r1 = p1.add_run()
    _set_run(r1, title, 24, True, WHITE)


def _add_footer(slide, prs: Presentation, page: int, total: int, role: str) -> None:
    foot = slide.shapes.add_textbox(Inches(0.45), Inches(7.1), Inches(12.2), Inches(0.3))
    tf = foot.text_frame
    p = tf.paragraphs[0]
    r = p.add_run()
    _set_run(
        r,
        f"PEERPoint · {role}  ·  Emergencies 911 · Crisis 988 · Peer line 801-548-8002  ·  {page}/{total}",
        10,
        False,
        MUTED,
    )


def _add_notes(slide, notes: str) -> None:
    text = (notes or "").strip()
    if not text:
        return
    notes_slide = slide.notes_slide
    notes_slide.notes_text_frame.text = text


def _bullets(slide, items: list[str], top: float = 1.35, left: float = 0.55, width: float = 12.0) -> None:
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(5.5))
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.level = 0
        p.space_after = Pt(9)
        r = p.add_run()
        _set_run(r, f"•  {item}", 17, False, INK)


def _two_col(slide, left_title: str, left_items: list[str], right_title: str, right_items: list[str]) -> None:
    card_l = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.45), Inches(1.35), Inches(6.0), Inches(5.4)
    )
    card_l.fill.solid()
    card_l.fill.fore_color.rgb = WHITE
    card_l.line.color.rgb = GREEN

    t_l = slide.shapes.add_textbox(Inches(0.7), Inches(1.55), Inches(5.5), Inches(0.4))
    r = t_l.text_frame.paragraphs[0].add_run()
    _set_run(r, left_title, 17, True, GREEN)

    b_l = slide.shapes.add_textbox(Inches(0.7), Inches(2.1), Inches(5.5), Inches(4.4))
    tf = b_l.text_frame
    tf.word_wrap = True
    for i, item in enumerate(left_items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(7)
        rr = p.add_run()
        _set_run(rr, f"•  {item}", 14, False, INK)

    card_r = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.7), Inches(1.35), Inches(6.0), Inches(5.4)
    )
    card_r.fill.solid()
    card_r.fill.fore_color.rgb = WHITE
    card_r.line.color.rgb = GREEN

    t_r = slide.shapes.add_textbox(Inches(6.95), Inches(1.55), Inches(5.5), Inches(0.4))
    r2 = t_r.text_frame.paragraphs[0].add_run()
    _set_run(r2, right_title, 17, True, GREEN)

    b_r = slide.shapes.add_textbox(Inches(6.95), Inches(2.1), Inches(5.5), Inches(4.4))
    tf2 = b_r.text_frame
    tf2.word_wrap = True
    for i, item in enumerate(right_items):
        p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
        p.space_after = Pt(7)
        rr = p.add_run()
        _set_run(rr, f"•  {item}", 14, False, INK)


def _title_slide(prs: Presentation, role: str, subtitle: str, audience: str) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_bg(slide, prs, GREEN_DARK)

    gold = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(2.35), prs.slide_width, Inches(0.1)
    )
    gold.fill.solid()
    gold.fill.fore_color.rgb = GOLD
    gold.line.fill.background()

    brand = slide.shapes.add_textbox(Inches(0.7), Inches(1.35), Inches(12), Inches(0.5))
    r = brand.text_frame.paragraphs[0].add_run()
    _set_run(r, "PEERPOINT  ·  SALT LAKE COUNTY SHERIFF'S OFFICE", 14, True, GOLD)

    title = slide.shapes.add_textbox(Inches(0.7), Inches(2.6), Inches(12), Inches(1.2))
    r = title.text_frame.paragraphs[0].add_run()
    _set_run(r, role, 40, True, WHITE)

    sub = slide.shapes.add_textbox(Inches(0.7), Inches(3.85), Inches(12), Inches(0.8))
    tf = sub.text_frame
    tf.word_wrap = True
    r = tf.paragraphs[0].add_run()
    _set_run(r, subtitle, 20, False, CREAM)

    aud = slide.shapes.add_textbox(Inches(0.7), Inches(5.1), Inches(12), Inches(0.6))
    r = aud.text_frame.paragraphs[0].add_run()
    _set_run(r, audience, 16, False, RGBColor(0xA8, 0xC4, 0xB8))

    urls = slide.shapes.add_textbox(Inches(0.7), Inches(6.4), Inches(12), Inches(0.5))
    r = urls.text_frame.paragraphs[0].add_run()
    _set_run(r, "mypeerpoint.com  ·  admin.mypeerpoint.com", 14, False, WHITE)


def _shot_path(name: str) -> Path | None:
    path = SHOT_DIR / name
    return path if path.exists() else None


def _screenshot_slide(
    prs: Presentation,
    role_label: str,
    title: str,
    caption: str,
    image_name: str,
    bullets: list[str],
    page: int,
    total: int,
) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_bg(slide, prs)
    _add_header_bar(slide, prs, title, f"PEERPoint · {role_label}")

    img = _shot_path(image_name)
    if img:
        slide.shapes.add_picture(str(img), Inches(0.4), Inches(1.3), width=Inches(7.5))
    else:
        missing = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(1.3), Inches(7.5), Inches(5.4)
        )
        missing.fill.solid()
        missing.fill.fore_color.rgb = WHITE
        missing.line.color.rgb = MUTED
        t = slide.shapes.add_textbox(Inches(0.7), Inches(3.5), Inches(6.8), Inches(1))
        r = t.text_frame.paragraphs[0].add_run()
        _set_run(r, f"Screenshot pending: {image_name}", 14, False, MUTED)

    card = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.15), Inches(1.3), Inches(4.7), Inches(5.4)
    )
    card.fill.solid()
    card.fill.fore_color.rgb = WHITE
    card.line.color.rgb = GREEN

    cap = slide.shapes.add_textbox(Inches(8.4), Inches(1.5), Inches(4.2), Inches(0.9))
    tf = cap.text_frame
    tf.word_wrap = True
    r = tf.paragraphs[0].add_run()
    _set_run(r, caption, 15, True, GREEN)

    b = slide.shapes.add_textbox(Inches(8.4), Inches(2.5), Inches(4.2), Inches(3.9))
    tf2 = b.text_frame
    tf2.word_wrap = True
    for i, item in enumerate(bullets):
        p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
        p.space_after = Pt(8)
        rr = p.add_run()
        _set_run(rr, f"•  {item}", 13, False, INK)

    _add_footer(slide, prs, page, total, role_label)


def _content_slide(
    prs: Presentation,
    role_label: str,
    title: str,
    bullets: list[str],
    page: int,
    total: int,
) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_bg(slide, prs)
    _add_header_bar(slide, prs, title, f"PEERPoint · {role_label}")
    _bullets(slide, bullets)
    _add_footer(slide, prs, page, total, role_label)


def _split_slide(
    prs: Presentation,
    role_label: str,
    title: str,
    left_title: str,
    left_items: list[str],
    right_title: str,
    right_items: list[str],
    page: int,
    total: int,
) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_bg(slide, prs)
    _add_header_bar(slide, prs, title, f"PEERPoint · {role_label}")
    _two_col(slide, left_title, left_items, right_title, right_items)
    _add_footer(slide, prs, page, total, role_label)


def build_deck(role_label: str, slides: list[dict]) -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    total = len(slides)
    page = 0
    for spec in slides:
        page += 1
        kind = spec["kind"]
        if kind == "title":
            _title_slide(prs, spec["role"], spec["subtitle"], spec["audience"])
        elif kind == "bullets":
            _content_slide(prs, role_label, spec["title"], spec["bullets"], page, total)
        elif kind == "split":
            _split_slide(
                prs,
                role_label,
                spec["title"],
                spec["left_title"],
                spec["left"],
                spec["right_title"],
                spec["right"],
                page,
                total,
            )
        elif kind == "shot":
            _screenshot_slide(
                prs,
                role_label,
                spec["title"],
                spec["caption"],
                spec["image"],
                spec.get("bullets", []),
                page,
                total,
            )
        else:
            raise ValueError(f"Unknown slide kind: {kind}")
        _add_notes(prs.slides[-1], spec.get("notes", ""))
    return prs


# ---------------------------------------------------------------------------
# Slide content + narration scripts
# ---------------------------------------------------------------------------

MEMBER_SLIDES: list[dict] = [
    {
        "kind": "title",
        "role": "Employee training",
        "subtitle": "How to request peer support and use Peer Point — with screenshots",
        "audience": "For Salt Lake County Sheriff’s Office employees requesting confidential peer support",
        "notes": (
            "Welcome to Peer Point training for Salt Lake County Sheriff’s Office employees. "
            "This short guide shows how to unlock the site, request peer support, and use chat or voice. "
            "Peer Support Members are the peers who provide that support. "
            "Take your time — you can pause and replay any slide."
        ),
    },
    {
        "kind": "bullets",
        "title": "What Peer Point is (and is not)",
        "bullets": [
            "Peer Point connects Salt Lake County Sheriff’s Office employees with Peer Support Members.",
            "Peer Support Members are peers who work in the Peer Support program to help employees.",
            "It is not clinical care, therapy, or emergency services.",
            "Chat and voice are not recorded by the agency in this app.",
            "Crisis help stays visible: 988, 911, and the peer support line.",
        ],
        "notes": (
            "Peer Point is peer support for Salt Lake County Sheriff’s Office employees. "
            "It connects you with Peer Support Members — peers who work within Peer Support to help employees. "
            "It is not clinical care, therapy, or emergency services. "
            "Chat and voice are not recorded by the agency in this app. "
            "If you are in immediate danger, call 911. For crisis support, call or text 988. "
            "The peer support line also stays available on the site."
        ),
    },
    {
        "kind": "shot",
        "title": "Step 1 — Unlock the site",
        "caption": "Site use code: slcoso",
        "image": "member-01-site-use-code.png",
        "bullets": [
            "Open https://mypeerpoint.com",
            "Site use code: slcoso",
            "Enter the code, then tap Continue",
            "Required each time you open the app",
            "Do NOT share this code outside the Sheriff’s Office",
        ],
        "notes": (
            "Open my Peer Point dot com on your phone or computer. "
            "The site use code is S L C O S O — S-L-C-O-S-O. "
            "Enter that code, then tap Continue. "
            "You will need this code each time you open the app, including when it is installed on your home screen. "
            "Important: do not give this code to anyone outside the Sheriff’s Office. "
            "It is only for current Salt Lake County Sheriff’s Office employees. "
            "The code identifies the workplace — it does not identify you personally."
        ),
    },
    {
        "kind": "shot",
        "title": "Step 2 — Home / Get Help",
        "caption": "Request peer support",
        "image": "member-02-home-request.png",
        "bullets": [
            "Choose Talk to a peer now or leave a follow-up request",
            "Phone + email are required",
            "Name is optional",
            "Confirm consent before submit",
        ],
        "notes": (
            "After unlock, you land on Get Help. "
            "You can talk to a Peer Support Member now, meet face to face when available, join with a room code, or leave a follow-up request. "
            "Phone and email are required so Peer Support can reach you. Your name is optional. "
            "Confirm consent that this is peer support — not emergency care — before you submit."
        ),
    },
    {
        "kind": "shot",
        "title": "Modern Home (optional)",
        "caption": "Try Modern UI",
        "image": "member-02b-modern-home.png",
        "bullets": [
            "Same Peer Point — updated layout",
            "Home, Resources, Check-ins, More",
            "Request Help starts from here",
        ],
        "notes": (
            "Optional: tap Try Modern UI for an updated layout with Home, Resources, Check-ins, and More. "
            "It is the same Peer Point. You can switch back anytime."
        ),
    },
    {
        "kind": "shot",
        "title": "Step 3 — Start a request",
        "caption": "Request intro",
        "image": "member-05-request-intro.png",
        "bullets": [
            "Pick chat, voice, form, or face-to-face",
            "Set peer preferences if offered",
            "Stay on the page for immediate contact",
        ],
        "notes": (
            "Choose how you want contact — chat, voice, a form follow-up, or face-to-face. "
            "If preferences are offered, you can ask for anyone, a specific Peer Support Member, civilian or sworn, or male or female matching. "
            "For immediate chat or voice, stay on the page while an On Call Peer Support Member is notified."
        ),
    },
    {
        "kind": "shot",
        "title": "Step 4 — Waiting in the room",
        "caption": "Chat room connected",
        "image": "member-06-waiting-in-room.png",
        "bullets": [
            "You may wait briefly for a Peer Support Member",
            "Room code reconnects you if dropped",
            "Codes expire after 24 hours unused",
        ],
        "notes": (
            "When a room opens, you will see Connected and may wait briefly for a Peer Support Member. "
            "If you get disconnected, use the same room code or join link to reconnect. "
            "Room codes expire after twenty-four hours with no use."
        ),
    },
    {
        "kind": "shot",
        "title": "Step 5 — Peer joined alert",
        "caption": "Blinking banner + soft sound",
        "image": "member-07-peer-joined-alert.png",
        "bullets": [
            "Banner appears when a Peer Support Member joins",
            "Soft alert may play (tap page once if muted by browser)",
            "Clear the notice when ready",
        ],
        "notes": (
            "When a Peer Support Member joins, a blinking banner appears and a soft alert may play. "
            "Browsers sometimes block sound until you tap the page once — use Clear notice when you are ready. "
            "You can then chat, or switch to voice with the same room code."
        ),
    },
    {
        "kind": "shot",
        "title": "Self Help",
        "caption": "Articles anytime",
        "image": "member-03-self-help.png",
        "bullets": [
            "Works offline",
            "Nothing is sent when you read",
            "Not a substitute for 911 / 988",
        ],
        "notes": (
            "Self Help articles are available anytime and work offline. "
            "Nothing is sent to a server when you read them. "
            "These tools support you — they do not replace 911 or 988 when you need crisis help."
        ),
    },
    {
        "kind": "shot",
        "title": "Resources",
        "caption": "Videos & gallery",
        "image": "member-04-resources.png",
        "bullets": [
            "Curated by Admins",
            "Includes coloring pages",
            "Use alongside peer support",
        ],
        "notes": (
            "Resources may include videos, downloads, and coloring pages curated by Admins. "
            "Use them alongside peer support whenever you need a quieter grounding option."
        ),
    },
    {
        "kind": "bullets",
        "title": "Employee quick checklist",
        "bullets": [
            "Unlock with site use code: slcoso (Sheriff’s Office only — do not share outside).",
            "Request Help → choose contact mode → submit.",
            "Wait for a Peer Support Member; watch for join banner / email / SMS.",
            "Chat or voice; reconnect with the same room code if needed.",
            "Use 911 / 988 when crisis care is needed.",
        ],
        "notes": (
            "Quick checklist for Salt Lake County Sheriff’s Office employees: "
            "unlock with the site use code S L C O S O. "
            "Remember — do not share that code with anyone outside the Sheriff’s Office. "
            "Then request help and submit; wait for a Peer Support Member and watch for the join banner or email or text; "
            "use chat or voice and reconnect with the same room code if needed; "
            "and use 911 or 988 when crisis care is needed. "
            "Thank you for taking a few minutes to learn Peer Point."
        ),
    },
]

STAFF_SLIDES: list[dict] = [
    {
        "kind": "title",
        "role": "Staff / Peer Support Member",
        "subtitle": "Sign in, On Call, accept requests, and support employees — with screenshots",
        "audience": "For Peer Support Members who provide peer support to Sheriff’s Office employees",
        "notes": (
            "Welcome to Peer Point staff training. "
            "This guide walks Peer Support Members through sign-in, On Call, assignment alerts, "
            "and supporting Salt Lake County Sheriff’s Office employees in chat or voice. "
            "Peer Support Members provide peer support. Sheriff’s Office employees are the people requesting help."
        ),
    },
    {
        "kind": "shot",
        "title": "Sign in",
        "caption": "mypeerpoint.com/staff",
        "image": "staff-01-login.png",
        "bullets": [
            "Use work email + password",
            "Not the Admin site",
            "Change temp password on first login",
            "Forgot password? Use the reset link",
        ],
        "notes": (
            "Sign in at my Peer Point dot com slash staff — not the Admin site. "
            "Use your work email and password. "
            "If you received a temporary password, you must change it before using staff tools. "
            "Forgot password sends a one-hour reset link to your email."
        ),
    },
    {
        "kind": "shot",
        "title": "Staff workspace",
        "caption": "Availability + Requests",
        "image": "staff-02-workspace.png",
        "bullets": [
            "Mark yourself Available when ready",
            "Set peer display name",
            "Refresh the queue as needed",
            "Session lasts ~12 hours",
        ],
        "notes": (
            "In the staff workspace, mark yourself Available when you can take work, "
            "and set your peer display name for assignments. "
            "Refresh the Requests queue as needed. Your session lasts about twelve hours."
        ),
    },
    {
        "kind": "shot",
        "title": "On Call",
        "caption": "Add coverage blocks",
        "image": "staff-03-on-call.png",
        "bullets": [
            "Add day + start/end times",
            "Acknowledge availability",
            "Immediate requests match On Call Peer Support Members",
            "Peer Support Members schedule themselves",
        ],
        "notes": (
            "Open the On Call tab and add blocks for the days and times you can cover. "
            "Acknowledge that you will be available during those times. "
            "Immediate chat and voice requests from Sheriff’s Office employees match On Call Peer Support Members, "
            "including sex preference when set. "
            "Peer Support Members schedule themselves; Admins can schedule others if needed."
        ),
    },
    {
        "kind": "shot",
        "title": "Assignment alert",
        "caption": "Blinking banner + sound loop",
        "image": "staff-04-assignment-alert.png",
        "bullets": [
            "Appears when an employee is matched to you",
            "Sound loops until Clear / Accept / Decline",
            "Use Test sound after login if needed",
            "Tab title also flashes",
        ],
        "notes": (
            "When a Salt Lake County Sheriff’s Office employee is matched to you, a blinking banner appears "
            "and a soft alert loops until you Clear the notice, Accept, or Decline. "
            "The browser tab title also flashes so you notice if you are in another tab. "
            "If you do not hear sound, click the page once or use Test sound — browsers block audio until a gesture."
        ),
    },
    {
        "kind": "shot",
        "title": "After Accept",
        "caption": "Request assigned",
        "image": "staff-05-after-accept.png",
        "bullets": [
            "Alert stops after Accept",
            "Open Peer chat / voice",
            "The employee may get email/SMS join link",
            "Share room code manually if needed",
        ],
        "notes": (
            "Accept stops the alert and assigns the room. "
            "Open Peer chat or Peer voice. "
            "The employee may receive an email or text with a join link when configured. "
            "If delivery fails, share the room code manually. Codes expire after twenty-four hours unused."
        ),
    },
    {
        "kind": "shot",
        "title": "In chat with the employee",
        "caption": "Same room code",
        "image": "staff-06-in-chat.png",
        "bullets": [
            "Use any display name you prefer",
            "Soft chime on new messages",
            "Add notes + log time on the request",
            "Close the request when finished",
        ],
        "notes": (
            "Join with any display name you are comfortable using. "
            "A soft chime plays on new messages. "
            "Add staff notes and log time on the request, then Close when finished. "
            "Do not paste room codes or employee details into public channels."
        ),
    },
    {
        "kind": "bullets",
        "title": "Peer Support Member quick checklist",
        "bullets": [
            "Sign in → Available + On Call.",
            "Watch for blinking assignment alerts.",
            "Accept → join chat/voice → support the employee.",
            "Notes / time → Close → Sign out.",
        ],
        "notes": (
            "Checklist for Peer Support Members: sign in, set Available, and add On Call; "
            "watch for blinking assignment alerts; Accept and join chat or voice; "
            "support the Sheriff’s Office employee; add notes and time; Close; then Sign out. "
            "Thank you for supporting your peers."
        ),
    },
]

LEADER_SLIDES: list[dict] = [
    {
        "kind": "title",
        "role": "Peer Support Leaders",
        "subtitle": "Coverage, escalation, and keeping the team ready — with screenshots",
        "audience": "For designated Peer Support Leaders",
        "notes": (
            "Welcome to Peer Point Leader training. "
            "Leaders are Peer Support Members with extra coverage responsibilities. "
            "You help make sure Sheriff’s Office employees can reach peer support when they need it."
        ),
    },
    {
        "kind": "bullets",
        "title": "What Leaders do",
        "bullets": [
            "Same day-to-day tools as Peer Support Members (queue, On Call, chat/voice).",
            "Extra: notified when coverage gaps happen or peers decline.",
            "Admins designate Leaders under Members (Make Leader).",
            "Help keep On Call filled and step in when employees are waiting.",
        ],
        "notes": (
            "Leaders have the same day-to-day tools as Peer Support Members — the queue, On Call, chat, and voice. "
            "Additionally, Leaders are notified when no free On Call peer is available, or when a peer declines. "
            "Admins designate Leaders under Members with Make Leader. "
            "Your job is to keep coverage filled and step in when a Sheriff’s Office employee is waiting."
        ),
    },
    {
        "kind": "shot",
        "title": "Staff workspace (Leaders use this too)",
        "caption": "Daily starting point",
        "image": "leader-01-workspace.png",
        "bullets": [
            "Stay Available when covering",
            "Watch Requests while On Call",
            "Respond quickly to waiting employees",
        ],
        "notes": (
            "Start in the staff workspace. Stay Available when you are covering, "
            "watch Requests while On Call, and respond quickly when a Sheriff’s Office employee is waiting."
        ),
    },
    {
        "kind": "shot",
        "title": "Assignment / coverage pressure",
        "caption": "Don’t ignore blinking alerts",
        "image": "leader-02-assignment-alert.png",
        "bullets": [
            "If you are matched — Accept or Decline promptly",
            "Declines can notify Leaders",
            "Find backup coverage when needed",
        ],
        "notes": (
            "Do not ignore blinking assignment alerts. "
            "If you are matched, Accept or Decline promptly. "
            "Declines can notify Leaders — find backup coverage or take the request yourself when you can."
        ),
    },
    {
        "kind": "shot",
        "title": "Peer Support Members roster (Admin view)",
        "caption": "Leader designation lives here",
        "image": "leader-03-members-leaders.png",
        "bullets": [
            "Admins mark Peer Support Leaders",
            "Confirm your Leader flag is set",
            "Help Peer Support Members finish setup / verify",
        ],
        "notes": (
            "Leader designation lives on the Members roster in the Admin site — that roster is Peer Support Members, "
            "not Sheriff’s Office employees requesting help. "
            "Confirm your Leader flag is set, and help teammates finish registration and phone verify so the team stays ready."
        ),
    },
    {
        "kind": "shot",
        "title": "On Call coverage",
        "caption": "Fill gaps before peak times",
        "image": "leader-04-on-call.png",
        "bullets": [
            "Review today’s schedule",
            "Ask Peer Support Members to add blocks",
            "Admins can schedule others if needed",
        ],
        "notes": (
            "Review today’s On Call schedule and fill gaps before peak times. "
            "Ask Peer Support Members to add blocks, or ask an Admin to schedule coverage when needed."
        ),
    },
    {
        "kind": "bullets",
        "title": "Leader quick checklist",
        "bullets": [
            "Confirm Leader designation on the roster.",
            "Check On Call coverage each shift day.",
            "Act on gap / decline notifications quickly.",
            "Step in or find a Peer Support Member when an employee is waiting.",
        ],
        "notes": (
            "Leader checklist: confirm your designation; check On Call each shift day; "
            "act quickly on gap and decline notifications; "
            "step in or find a Peer Support Member when a Sheriff’s Office employee is waiting. "
            "Thank you for leading coverage for the team."
        ),
    },
]

ADMIN_SLIDES: list[dict] = [
    {
        "kind": "title",
        "role": "Admin training",
        "subtitle": "Invite Peer Support Members, manage accounts, content, and reports",
        "audience": "For program administrators on admin.mypeerpoint.com",
        "notes": (
            "Welcome to Peer Point Admin training. "
            "This guide covers the Admin site: inviting Peer Support Members, managing accounts and Leaders, "
            "On Call oversight, the request queue for Sheriff’s Office employees, Content, and Reports. "
            "Remember: Peer Support Members provide support. Salt Lake County Sheriff’s Office employees are the people requesting help."
        ),
    },
    {
        "kind": "shot",
        "title": "Admin workspace",
        "caption": "admin.mypeerpoint.com",
        "image": "admin-01-workspace.png",
        "bullets": [
            "Admin accounts only on this host",
            "Peer Support Members use mypeerpoint.com/staff",
            "Admins inherit staff queue rights",
            "Change seed password after first login",
        ],
        "notes": (
            "Sign in at admin dot my Peer Point dot com. Production Admin host is for Admin accounts only. "
            "Peer Support Members sign in at my Peer Point dot com slash staff. "
            "Admins inherit staff queue rights. Change the seed Admin password after first login."
        ),
    },
    {
        "kind": "shot",
        "title": "Members (Peer Support roster)",
        "caption": "Invite + manage Peer Support Members",
        "image": "admin-02-members.png",
        "bullets": [
            "Invite Staff or Admin Peer Support accounts",
            "Resend / Revoke pending invites",
            "Disable / Enable accounts",
            "Make Leader for coverage alerts",
            "Set Male / Female for matching",
        ],
        "notes": (
            "The Members tab is the Peer Support Member roster — not Sheriff’s Office employees requesting help. "
            "Invite Staff or Admin access. Keep the invite link as a backup if email is delayed. "
            "Resend or Revoke pending invites. Disable or Enable accounts as needed. "
            "Make Leader for coverage-gap alerts, and set Male or Female for matching preferences."
        ),
    },
    {
        "kind": "shot",
        "title": "On Call (Admin)",
        "caption": "Schedule any Peer Support Member",
        "image": "admin-03-on-call.png",
        "bullets": [
            "Admins can schedule any Peer Support Member",
            "Require availability acknowledgment",
            "Keep coverage continuous for employees",
        ],
        "notes": (
            "Admins can schedule any Peer Support Member on On Call. "
            "Require availability acknowledgment before saving blocks, and keep coverage continuous "
            "so Sheriff’s Office employees can get help."
        ),
    },
    {
        "kind": "shot",
        "title": "Requests queue",
        "caption": "Employee requests + assignment",
        "image": "admin-06-requests.png",
        "bullets": [
            "Refresh for new employee requests",
            "Assign / accept flows",
            "Close completed requests",
            "Confirm alerts reach Peer Support Members",
        ],
        "notes": (
            "Use the Requests queue for oversight of help requests from Sheriff’s Office employees: "
            "refresh for new work, assign or accept as needed, close completed requests, "
            "and confirm that in-app alerts and email or SMS reach Peer Support Members."
        ),
    },
    {
        "kind": "shot",
        "title": "Content",
        "caption": "Self Help + Resources",
        "image": "admin-04-content.png",
        "bullets": [
            "Edit Self Help articles",
            "Embed video links",
            "Upload Resource Gallery files",
            "Publish or reset built-ins",
        ],
        "notes": (
            "In Content, edit Self Help articles, embed video links, upload Resource Gallery files, "
            "and publish or reset to built-in articles when needed. "
            "Employees see this content on the member site."
        ),
    },
    {
        "kind": "shot",
        "title": "Reports",
        "caption": "Program metrics",
        "image": "admin-05-reports.png",
        "bullets": [
            "Open / assigned / closed totals",
            "Minutes by Peer Support Member",
            "Notes and On Call history",
            "Refresh after staff log time",
        ],
        "notes": (
            "Reports show open, assigned, and closed totals, minutes by Peer Support Member, "
            "notes, and On Call history. Refresh after Peer Support Members log notes or time."
        ),
    },
    {
        "kind": "bullets",
        "title": "Admin quick checklist",
        "bullets": [
            "Sign in at admin.mypeerpoint.com.",
            "Invite Peer Support Members / Admins; designate Leaders.",
            "Keep On Call coverage current.",
            "Monitor employee request queue + alert delivery.",
            "Maintain Content; review Reports.",
        ],
        "notes": (
            "Admin checklist: sign in at admin dot my Peer Point dot com; "
            "invite Peer Support Members and Admins and designate Leaders; "
            "keep On Call current; monitor the employee request queue and alert delivery; "
            "maintain Content and review Reports. "
            "Thank you for running Peer Point for the team."
        ),
    },
]


DECKS = [
    ("Employee", "PEERPoint-Training-Member.pptx", MEMBER_SLIDES),
    ("Staff", "PEERPoint-Training-Staff.pptx", STAFF_SLIDES),
    ("Leaders", "PEERPoint-Training-Leaders.pptx", LEADER_SLIDES),
    ("Admin", "PEERPoint-Training-Admin.pptx", ADMIN_SLIDES),
]


def write_decks() -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    missing = []
    for _, _, slides in DECKS:
        for s in slides:
            if s.get("kind") == "shot" and not _shot_path(s["image"]):
                missing.append(s["image"])
    if missing:
        print(f"Warning: {len(set(missing))} screenshot(s) missing (placeholders used).")

    written: list[Path] = []
    for role_label, filename, slides in DECKS:
        prs = build_deck(role_label, slides)
        path = OUT_DIR / filename
        prs.save(path)
        written.append(path)
        if PUBLIC_DOCS.exists():
            copy = PUBLIC_DOCS / filename
            prs.save(copy)
            written.append(copy)
    return written


def _for_speech(text: str) -> str:
    """Normalize brand/URLs so TTS says 'Peer Point', not letter-by-letter P-E-E-R."""
    import re

    spoken = text or ""
    # Brand name (any casing / spacing)
    spoken = re.sub(r"\bPEER\s*Point\b", "Peer Point", spoken, flags=re.IGNORECASE)
    spoken = re.sub(r"\bPEERPOINT\b", "Peer Point", spoken, flags=re.IGNORECASE)
    # Common URLs in the scripts
    spoken = re.sub(
        r"https?://admin\.mypeerpoint\.com",
        "admin dot my Peer Point dot com",
        spoken,
        flags=re.IGNORECASE,
    )
    spoken = re.sub(
        r"https?://mypeerpoint\.com",
        "my Peer Point dot com",
        spoken,
        flags=re.IGNORECASE,
    )
    spoken = re.sub(
        r"\badmin\.mypeerpoint\.com\b",
        "admin dot my Peer Point dot com",
        spoken,
        flags=re.IGNORECASE,
    )
    spoken = re.sub(
        r"\bmypeerpoint\.com\b",
        "my Peer Point dot com",
        spoken,
        flags=re.IGNORECASE,
    )
    # Site use code: speak letter-by-letter so viewers enter it correctly
    spoken = re.sub(
        r"\bslcoso\b",
        "S L C O S O",
        spoken,
        flags=re.IGNORECASE,
    )
    return spoken


async def _synthesize(text: str, out_mp3: Path) -> None:
    import edge_tts
    import re

    # Soften delivery: short pauses after sentence ends via ellipsis spacing
    cleaned = _for_speech(text)
    cleaned = re.sub(r"\s+", " ", cleaned.strip())
    cleaned = re.sub(r"([.!?])\s+", r"\1 ... ", cleaned)
    communicate = edge_tts.Communicate(
        cleaned,
        TTS_VOICE,
        rate=TTS_RATE,
        pitch=TTS_PITCH,
    )
    await communicate.save(str(out_mp3))


def generate_narration_audio() -> dict[str, list[Path]]:
    """Generate one MP3 per slide; returns {deck_key: [mp3 paths in slide order]}."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    result: dict[str, list[Path]] = {}

    async def run_all() -> None:
        tasks = []
        for role_label, filename, slides in DECKS:
            key = Path(filename).stem
            deck_dir = AUDIO_DIR / key
            deck_dir.mkdir(parents=True, exist_ok=True)
            paths: list[Path] = []
            for i, slide in enumerate(slides, start=1):
                notes = (slide.get("notes") or "").strip()
                if not notes:
                    notes = f"Slide {i}."
                spoken = _for_speech(notes)
                # Include spoken form in digest so pronunciation fixes regenerate audio
                digest = hashlib.sha1(
                    f"{TTS_VOICE}|{TTS_RATE}|{TTS_PITCH}|{spoken}".encode("utf-8")
                ).hexdigest()[:10]
                mp3 = deck_dir / f"{i:02d}-{digest}.mp3"
                paths.append(mp3)
                if not mp3.exists() or mp3.stat().st_size < 500:
                    tasks.append(_synthesize(notes, mp3))
            result[key] = paths

        if tasks:
            print(f"Generating {len(tasks)} narration clips with {TTS_VOICE} ({TTS_RATE})…")
            batch = 4
            for i in range(0, len(tasks), batch):
                await asyncio.gather(*tasks[i : i + batch])
                print(f"  … {min(i + batch, len(tasks))}/{len(tasks)}")
        else:
            print("Narration audio already cached.")

    asyncio.run(run_all())
    return result


def embed_narration_with_powerpoint(pptx_path: Path, mp3_paths: list[Path]) -> None:
    """Embed MP3s so narration auto-plays whenever a slide is entered (click or advance)."""
    import win32com.client  # type: ignore

    # Office constants
    msoMedia = 16
    msoAnimEffectMediaPlay = 83
    msoAnimTriggerWithPrevious = 2  # start when the slide appears (not on extra click)

    ppt = win32com.client.Dispatch("PowerPoint.Application")
    ppt.Visible = 1
    try:
        presentation = ppt.Presentations.Open(str(pptx_path.resolve()), WithWindow=True)
        slide_count = presentation.Slides.Count
        if slide_count != len(mp3_paths):
            print(
                f"  Warning: {pptx_path.name} has {slide_count} slides but {len(mp3_paths)} audio files"
            )

        for i in range(1, slide_count + 1):
            slide = presentation.Slides(i)
            mp3 = mp3_paths[i - 1] if i - 1 < len(mp3_paths) else None
            if not mp3 or not mp3.exists():
                continue

            # Remove prior media (re-runs)
            to_delete = []
            for shape in list(slide.Shapes):
                try:
                    if shape.Type == msoMedia:
                        to_delete.append(shape)
                except Exception:
                    pass
            for shape in to_delete:
                shape.Delete()

            # Small icon tucked away; hidden while playing
            media = slide.Shapes.AddMediaObject2(
                FileName=str(mp3.resolve()),
                LinkToFile=False,
                SaveWithDocument=True,
                Left=12,
                Top=510,
                Width=28,
                Height=22,
            )

            # Legacy play-on-entry flags
            try:
                media.AnimationSettings.Animate = True
                media.AnimationSettings.PlaySettings.PlayOnEntry = True
                media.AnimationSettings.PlaySettings.HideWhileNotPlaying = True
                media.AnimationSettings.PlaySettings.LoopUntilStopped = False
                media.AnimationSettings.PlaySettings.StopPrevious = True
            except Exception:
                pass

            # Modern timeline: force "With Previous" so audio starts on slide navigation
            try:
                seq = slide.TimeLine.MainSequence
                # Prefer the effect attached to this media shape
                target = None
                for ei in range(1, seq.Count + 1):
                    ef = seq(ei)
                    try:
                        if ef.Shape.Id == media.Id:
                            target = ef
                            break
                    except Exception:
                        pass
                if target is None:
                    # Fall back: add an explicit media-play effect
                    target = seq.AddEffect(
                        Shape=media,
                        effectId=msoAnimEffectMediaPlay,
                        trigger=msoAnimTriggerWithPrevious,
                    )
                target.Timing.TriggerType = msoAnimTriggerWithPrevious
                try:
                    target.Timing.TriggerDelayTime = 0
                except Exception:
                    pass
            except Exception as exc:
                print(f"  timeline warning slide {i}: {exc}")

            # Manual navigation: click advances; do not auto-skip while audio plays
            try:
                slide.SlideShowTransition.AdvanceOnClick = True
                slide.SlideShowTransition.AdvanceOnTime = False
            except Exception as exc:
                print(f"  transition warning slide {i}: {exc}")

        try:
            presentation.SlideShowSettings.ShowWithNarration = True
            presentation.SlideShowSettings.ShowWithAnimation = True
        except Exception:
            pass

        presentation.Save()
        presentation.Close()
        print(f"  Narration auto-play on slide entry: {pptx_path.name}")
    finally:
        try:
            ppt.Quit()
        except Exception:
            pass
        time.sleep(0.5)


def fix_existing_narration_triggers(pptx_path: Path) -> None:
    """Re-open an already-narrated deck and force media to play on slide entry."""
    import win32com.client  # type: ignore

    msoMedia = 16
    msoAnimTriggerWithPrevious = 2

    ppt = win32com.client.Dispatch("PowerPoint.Application")
    ppt.Visible = 1
    try:
        presentation = ppt.Presentations.Open(str(pptx_path.resolve()), WithWindow=True)
        for i in range(1, presentation.Slides.Count + 1):
            slide = presentation.Slides(i)
            for shape in slide.Shapes:
                try:
                    if shape.Type != msoMedia:
                        continue
                    shape.AnimationSettings.Animate = True
                    shape.AnimationSettings.PlaySettings.PlayOnEntry = True
                    shape.AnimationSettings.PlaySettings.HideWhileNotPlaying = True
                    shape.AnimationSettings.PlaySettings.StopPrevious = True
                except Exception:
                    pass
            try:
                seq = slide.TimeLine.MainSequence
                for ei in range(1, seq.Count + 1):
                    ef = seq(ei)
                    # Media play effects (83) or anything tied to media
                    try:
                        ef.Timing.TriggerType = msoAnimTriggerWithPrevious
                        ef.Timing.TriggerDelayTime = 0
                    except Exception:
                        pass
            except Exception:
                pass
            try:
                slide.SlideShowTransition.AdvanceOnClick = True
                slide.SlideShowTransition.AdvanceOnTime = False
            except Exception:
                pass
        try:
            presentation.SlideShowSettings.ShowWithNarration = True
            presentation.SlideShowSettings.ShowWithAnimation = True
        except Exception:
            pass
        presentation.Save()
        presentation.Close()
        print(f"  Fixed auto-play triggers: {pptx_path.name}")
    finally:
        try:
            ppt.Quit()
        except Exception:
            pass
        time.sleep(0.4)


def narrate_all(paths: list[Path]) -> None:
    audio_map = generate_narration_audio()
    # Map filename stem → mp3 list
    for path in paths:
        # Only narrate the docs/training copies (not public duplicates twice)
        if PUBLIC_DOCS.exists() and PUBLIC_DOCS in path.parents:
            continue
        key = path.stem
        mp3s = audio_map.get(key)
        if not mp3s:
            print(f"No audio for {path.name}")
            continue
        print(f"Embedding narration into {path.name}…")
        embed_narration_with_powerpoint(path, mp3s)
        # Re-copy narrated file to public docs
        if PUBLIC_DOCS.exists():
            dest = PUBLIC_DOCS / path.name
            dest.write_bytes(path.read_bytes())
            print(f"  Copied to {dest}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate PEERPoint training PPTX (+ optional narration)")
    parser.add_argument(
        "--narrate",
        action="store_true",
        help="Generate TTS audio and embed into PowerPoint (requires PowerPoint + edge-tts)",
    )
    parser.add_argument(
        "--fix-autoplay",
        action="store_true",
        help="Only fix existing decks so narration plays on every slide navigation",
    )
    args = parser.parse_args()

    if args.fix_autoplay:
        for path in sorted(OUT_DIR.glob("PEERPoint-Training-*.pptx")):
            print(f"Fixing {path.name}…")
            fix_existing_narration_triggers(path)
            if PUBLIC_DOCS.exists():
                dest = PUBLIC_DOCS / path.name
                dest.write_bytes(path.read_bytes())
        print("Done. Open Slide Show and click through — narration should start on each slide.")
        return

    written = write_decks()
    print(f"Wrote {len(DECKS)} training decks with speaker notes:")
    for p in written:
        print(f"  {p}")

    if args.narrate:
        # Only pass unique training-dir pptx files
        unique = [p for p in written if p.parent == OUT_DIR]
        narrate_all(unique)
        print("Done. Open each PPTX and use Slide Show — narration plays when you enter each slide.")


if __name__ == "__main__":
    main()
