"""AI academic assistant service (Gemini REST + Local Extractive Vietnamese Engine)."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
import json
import logging
import math
import re
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple
import unicodedata
import uuid

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.api.routes.quizzes import validate_question_contract
from backend.app.core.config import settings
from backend.app.models.models import (
    AiInteractionLog,
    Assignment,
    Course,
    Lesson,
    StoredFile,
    Submission,
    User,
)
from backend.app.schemas.schemas import (
    AiFeedbackSuggestResponse,
    AiQuizDraftQuestion,
    AiQuizGenerateResponse,
    AiTutorResponse,
)

logger = logging.getLogger(__name__)

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_TIMEOUT_SECONDS = 15.0
MAX_CONTEXT_CHARS = 16000
MAX_PROMPT_SUMMARY_CHARS = 500

ProviderMode = Literal["GEMINI", "LOCAL_FALLBACK"]
TutorMode = Literal["SUMMARY", "EXPLAIN", "PRACTICE_QUESTIONS", "QA"]
QuestionType = Literal["SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"]

_IGNORED_HTML_TAGS = {"script", "style", "noscript", "template", "svg", "object", "iframe"}
_BLOCK_HTML_TAGS = {
    "p",
    "div",
    "br",
    "hr",
    "li",
    "ul",
    "ol",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "tr",
    "blockquote",
    "pre",
    "section",
    "article",
}

VIETNAMESE_STOPWORDS = {
    # Vietnamese functional words (accented & ascii-folded)
    "và", "va", "của", "cua", "là", "la", "có", "co", "trong", "cho", "với", "voi",
    "các", "cac", "những", "nhung", "được", "duoc", "một", "mot", "này", "nay",
    "đó", "do", "khi", "để", "de", "từ", "tu", "trên", "tren", "về", "ve", "như", "nhu",
    "tại", "tai", "theo", "hay", "hoặc", "hoac", "nhưng", "nhung", "vì", "vi",
    "nên", "nen", "nếu", "neu", "thì", "thi", "mà", "ma", "đã", "da", "đang", "dang",
    "sẽ", "se", "cũng", "cung", "rất", "rat", "nhiều", "nhieu", "ít", "it", "hơn", "hon",
    "nhất", "nhat", "bằng", "bang", "qua", "vào", "vao", "ra", "lên", "len", "xuống", "xuong",
    "gì", "gi", "nào", "nao", "ai", "đâu", "dau", "sao", "bao", "nhiêu", "nhieu",
    "cần", "can", "phải", "phai", "thể", "the", "nội", "noi", "dung", "dùng", "dung",
    "hãy", "hay", "cho", "biết", "biet", "nêu", "neu", "giải", "giai", "thích", "thich",
    "tóm", "tom", "tắt", "tat", "thế", "the", "nào", "sử", "su", "dụng",
    # English functional words
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "have", "has", "had", "into", "about", "your", "their", "what", "which", "when",
    "where", "how", "can", "will", "not", "but", "use", "using",
}

_FALLBACK_DISTRACTORS = [
    "Khái niệm không thuộc phạm vi nội dung bài học này",
    "Cơ chế xử lý ngoại tuyến không liên quan tới chủ đề đang xét",
    "Phương pháp lưu trữ tĩnh bỏ qua bước kiểm tra đầu vào",
    "Tham số tùy chọn chỉ dùng cho cấu hình hệ thống cũ",
]


class _TextExtractorHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._chunks: List[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        lower = tag.lower()
        if lower in _IGNORED_HTML_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth == 0:
            if lower in _BLOCK_HTML_TAGS:
                self._chunks.append("\n")
            elif lower in {"td", "th"}:
                self._chunks.append(" ")

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower in _IGNORED_HTML_TAGS:
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return
        if self._skip_depth == 0 and lower in _BLOCK_HTML_TAGS:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data:
            self._chunks.append(data)

    def handle_entityref(self, name: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(unescape(f"&#{name};"))

    def get_text(self) -> str:
        raw = unescape("".join(self._chunks)).replace("\xa0", " ")
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw.splitlines()]
        cleaned = "\n".join(line for line in lines if line)
        return cleaned.strip()


@dataclass
class LessonContext:
    lesson_id: uuid.UUID
    course_id: uuid.UUID
    title: str
    content_type: str
    html_text: str
    attachment_name: Optional[str]
    attachment_text: str
    combined_text: str
    citations: List[str]
    insufficient_text: bool


def strip_html_to_text(raw_html: Optional[str]) -> str:
    """Safely strip HTML tags into clean readable plain text."""
    if not raw_html or not raw_html.strip():
        return ""
    parser = _TextExtractorHTMLParser()
    try:
        parser.feed(raw_html)
        parser.close()
    except Exception:
        return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", raw_html))).strip()
    return parser.get_text()


def _fold_vietnamese(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D"))
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).casefold()


def tokenize_terms(text: str, folded: bool = False) -> List[str]:
    source = _fold_vietnamese(text) if folded else text.casefold()
    raw_tokens = re.findall(r"[^\W_]+", source, flags=re.UNICODE)
    return [tok for tok in raw_tokens if len(tok) >= 2 and tok not in VIETNAMESE_STOPWORDS]


def split_sentences(text: str) -> List[str]:
    if not text or not text.strip():
        return []
    sentences: List[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = re.sub(r"^\s*(?:#{1,6}\s+|[-*•]+\s+|\d+[.)]\s+)", "", raw_line).strip()
        if not line:
            continue
        parts = re.split(r"(?<=[.!?])\s+(?=[^\d])", line)
        for part in parts:
            cleaned = re.sub(r"\s+", " ", part).strip()
            if len(cleaned) < 8:
                continue
            key = cleaned.casefold()
            if key not in seen:
                seen.add(key)
                sentences.append(cleaned)
    return sentences


def rank_sentences(
    sentences: Sequence[str],
    query: Optional[str] = None,
    title_hint: str = "",
) -> List[Tuple[float, int, str]]:
    if not sentences:
        return []

    corpus_tf: Counter[str] = Counter()
    for sentence in sentences:
        corpus_tf.update(tokenize_terms(sentence))

    title_terms = set(tokenize_terms(title_hint, folded=True))
    query_terms = set(tokenize_terms(query or "", folded=False))
    query_folded = set(tokenize_terms(query or "", folded=True))

    ranked: List[Tuple[float, int, str]] = []
    for idx, sentence in enumerate(sentences):
        tokens = tokenize_terms(sentence, folded=False)
        folded_tokens = tokenize_terms(sentence, folded=True)
        norm = math.sqrt(max(len(tokens), 1))
        tf_score = sum(corpus_tf[tok] for tok in set(tokens)) / norm
        title_overlap = len(set(folded_tokens) & title_terms) * 0.35

        query_score = 0.0
        if query_folded:
            exact_hits = len(set(tokens) & query_terms)
            folded_hits = len(set(folded_tokens) & query_folded)
            substring_hits = sum(
                1
                for qt in query_folded
                if len(qt) >= 3 and qt in _fold_vietnamese(sentence)
            )
            query_score = (exact_hits * 2.5) + (folded_hits * 1.8) + (substring_hits * 1.2)

        total_score = query_score + (tf_score * 0.6) + title_overlap
        ranked.append((total_score, idx, sentence))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked


def _truncate_summary(text: str, limit: int = MAX_PROMPT_SUMMARY_CHARS) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if not cleaned:
        return "-"
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: max(1, limit - 3)].rstrip() + "..."


def _log_ai_interaction(
    db: Session,
    user_id: uuid.UUID,
    course_id: Optional[uuid.UUID],
    feature: Literal["LESSON_TUTOR", "QUIZ_GENERATOR", "GRADING_FEEDBACK"],
    provider_mode: ProviderMode,
    prompt_summary: str,
) -> None:
    entry = AiInteractionLog(
        LogId=uuid.uuid4(),
        UserId=user_id,
        CourseId=course_id,
        Feature=feature,
        ProviderMode=provider_mode,
        PromptSummary=_truncate_summary(prompt_summary),
    )
    db.add(entry)
    db.commit()


def _extract_gemini_text(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return None
    first = candidates[0]
    if not isinstance(first, dict):
        return None
    content = first.get("content")
    if not isinstance(content, dict):
        return None
    parts = content.get("parts")
    if not isinstance(parts, list):
        return None
    texts = [str(part["text"]) for part in parts if isinstance(part, dict) and part.get("text")]
    joined = "\n".join(texts).strip()
    return joined or None


def _parse_json_block(raw_text: str) -> Any:
    cleaned = raw_text.strip()
    fence_match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        for opener, closer in (("{", "}"), ("[", "]")):
            start = cleaned.find(opener)
            end = cleaned.rfind(closer)
            if start != -1 and end > start:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    continue
        return None


def _call_gemini_generate_content(
    system_instruction: str,
    user_prompt: str,
    response_mime_type: Optional[str] = None,
    temperature: float = 0.3,
    max_output_tokens: int = 1200,
) -> Optional[str]:
    api_key = (settings.GEMINI_API_KEY or "").strip()
    if not api_key:
        return None

    model = (settings.GEMINI_MODEL or "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    endpoint = f"{GEMINI_API_BASE}/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    generation_config: Dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if response_mime_type:
        generation_config["responseMimeType"] = response_mime_type

    request_body = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": generation_config,
    }

    try:
        with httpx.Client(timeout=GEMINI_TIMEOUT_SECONDS) as client:
            response = client.post(endpoint, headers=headers, json=request_body)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Gemini REST request failed (%s); using local fallback.", type(exc).__name__)
        return None

    if response.status_code != 200:
        logger.warning(
            "Gemini REST returned HTTP %s; using local fallback.",
            response.status_code,
        )
        return None

    try:
        data = response.json()
    except (ValueError, TypeError):
        logger.warning("Gemini REST returned non-JSON payload; using local fallback.")
        return None

    return _extract_gemini_text(data)


def _build_lesson_context(db: Session, lesson: Lesson, course_id: uuid.UUID) -> LessonContext:
    html_text = strip_html_to_text(lesson.ContentHtml)
    attachment_name: Optional[str] = None
    attachment_text = ""

    if lesson.AttachmentFileId is not None:
        stored_file = (
            db.query(StoredFile)
            .filter(StoredFile.FileId == lesson.AttachmentFileId)
            .first()
        )
        if stored_file is not None:
            attachment_name = stored_file.OriginalName
            attachment_text = (stored_file.ExtractedText or "").strip()

    body_parts = [part for part in (html_text, attachment_text) if part]
    body_text = "\n\n".join(body_parts).strip()

    compact_html = re.sub(r"\s+", "", html_text)
    compact_att = re.sub(r"\s+", "", attachment_text)
    content_type = (lesson.ContentType or "TEXT").upper()

    if content_type == "VIDEO" and not compact_att and len(compact_html) < 30:
        insufficient = True
    elif len(compact_html) + len(compact_att) < 15 or len(tokenize_terms(body_text)) < 3:
        insufficient = True
    else:
        insufficient = False

    citations: List[str] = []
    if html_text:
        citations.append(f"Bài giảng: {lesson.Title}")
    if attachment_name and attachment_text:
        citations.append(f"Tài liệu đính kèm: {attachment_name}")
    elif not citations and not insufficient:
        citations.append(f"Bài giảng: {lesson.Title}")

    combined_sections = [f"Tiêu đề bài giảng: {lesson.Title}"]
    if html_text:
        combined_sections.append(f"Nội dung bài giảng:\n{html_text}")
    if attachment_text:
        label = attachment_name or "Tài liệu đính kèm"
        combined_sections.append(f"Nội dung trích xuất từ tệp ({label}):\n{attachment_text}")
    combined_text = "\n\n".join(combined_sections)[:MAX_CONTEXT_CHARS]

    return LessonContext(
        lesson_id=lesson.LessonId,
        course_id=course_id,
        title=lesson.Title,
        content_type=content_type,
        html_text=html_text,
        attachment_name=attachment_name,
        attachment_text=attachment_text,
        combined_text=combined_text,
        citations=citations,
        insufficient_text=insufficient,
    )


def _extract_top_keywords(text: str, limit: int = 6) -> List[str]:
    counts: Counter[str] = Counter()
    display_map: Dict[str, str] = {}
    for raw_tok in re.findall(r"[^\W_]+", text, flags=re.UNICODE):
        lower = raw_tok.casefold()
        if len(lower) < 2 or lower in VIETNAMESE_STOPWORDS:
            continue
        counts[lower] += 1
        if lower not in display_map:
            display_map[lower] = raw_tok
    return [display_map[key] for key, _ in counts.most_common(limit)]


def _local_lesson_tutor(ctx: LessonContext, mode: TutorMode, question: Optional[str]) -> AiTutorResponse:
    if ctx.insufficient_text:
        if ctx.content_type == "VIDEO":
            msg = (
                f"Bài giảng '{ctx.title}' hiện chủ yếu ở dạng video và chưa có văn bản mô tả "
                "hoặc tài liệu trích xuất đi kèm. Trợ lý AI chưa đủ dữ liệu văn bản để trả lời chính xác; "
                "giảng viên có thể bổ sung tóm tắt nội dung hoặc đính kèm tài liệu PDF/DOCX/TXT/MD."
            )
        else:
            msg = (
                f"Bài giảng '{ctx.title}' hiện chưa có đủ nội dung văn bản để phân tích tự động. "
                "Vui lòng bổ sung mô tả bài học hoặc tệp tài liệu văn bản (PDF, DOCX, PPTX, TXT, MD)."
            )
        return AiTutorResponse(
            answer=msg,
            providerMode="LOCAL_FALLBACK",
            insufficientText=True,
            citations=[],
        )

    body_text = "\n".join(part for part in (ctx.html_text, ctx.attachment_text) if part)
    sentences = split_sentences(body_text)
    if not sentences:
        return AiTutorResponse(
            answer=f"Chưa trích xuất được câu nội dung hoàn chỉnh từ bài giảng '{ctx.title}'.",
            providerMode="LOCAL_FALLBACK",
            insufficientText=True,
            citations=[],
        )

    citations = list(ctx.citations)
    ranked = rank_sentences(sentences, query=question, title_hint=ctx.title)

    if mode == "SUMMARY":
        selected = sorted(ranked[:4], key=lambda item: item[1])
        bullets = "\n".join(f"- {sent}" for _, _, sent in selected)
        keywords = _extract_top_keywords(body_text, limit=5)
        kw_line = f"\n\nTừ khóa trọng tâm: {', '.join(keywords)}." if keywords else ""
        answer = f"Tóm tắt nội dung chính của bài '{ctx.title}':\n{bullets}{kw_line}"
        for _, _, sent in selected[:2]:
            citations.append(f'Trích dẫn: "{sent[:120]}"')
        return AiTutorResponse(
            answer=answer,
            providerMode="LOCAL_FALLBACK",
            insufficientText=False,
            citations=citations,
        )

    if mode == "EXPLAIN":
        explain_cues = (" là ", " gồm", " bao gồm", " dùng để", " giúp ", " cho phép", ":")
        scored_explain: List[Tuple[float, int, str]] = []
        for base_score, idx, sent in ranked:
            cue_bonus = 1.2 if any(cue in sent.casefold() for cue in explain_cues) else 0.0
            scored_explain.append((base_score + cue_bonus, idx, sent))
        scored_explain.sort(key=lambda item: (-item[0], item[1]))
        chosen = sorted(scored_explain[:4], key=lambda item: item[1])
        explanation_lines = "\n".join(f"- {sent}" for _, _, sent in chosen)
        focus_note = f" theo trọng tâm '{question.strip()}'" if question and question.strip() else ""
        answer = (
            f"Giải thích chi tiết bài '{ctx.title}'{focus_note}:\n"
            f"{explanation_lines}\n\n"
            "Gợi ý ôn tập: Hãy đối chiếu từng khái niệm trên với ví dụ thực hành trong bài giảng."
        )
        for _, _, sent in chosen[:2]:
            citations.append(f'Trích dẫn: "{sent[:120]}"')
        return AiTutorResponse(
            answer=answer,
            providerMode="LOCAL_FALLBACK",
            insufficientText=False,
            citations=citations,
        )

    if mode == "PRACTICE_QUESTIONS":
        top_items = [sent for _, _, sent in ranked[:3]]
        lines = [f"Câu hỏi luyện tập tự kiểm tra cho bài '{ctx.title}':"]
        for idx, sent in enumerate(top_items, start=1):
            terms = _extract_top_keywords(sent, limit=2)
            focus = terms[0] if terms else "nội dung bài học"
            lines.append(
                f"{idx}. Hãy giải thích vai trò hoặc ý nghĩa của '{focus}' dựa trên nội dung bài học.\n"
                f"   Gợi ý tham khảo: {sent}"
            )
            citations.append(f'Nguồn luyện tập {idx}: "{sent[:110]}"')
        return AiTutorResponse(
            answer="\n".join(lines),
            providerMode="LOCAL_FALLBACK",
            insufficientText=False,
            citations=citations,
        )

    # QA mode
    cleaned_question = (question or "").strip()
    if not cleaned_question:
        top_items = sorted(ranked[:3], key=lambda item: item[1])
        bullets = "\n".join(f"- {sent}" for _, _, sent in top_items)
        answer = f"Nội dung trọng tâm của bài '{ctx.title}':\n{bullets}"
        for _, _, sent in top_items[:2]:
            citations.append(f'Trích dẫn: "{sent[:120]}"')
        return AiTutorResponse(
            answer=answer,
            providerMode="LOCAL_FALLBACK",
            insufficientText=False,
            citations=citations,
        )

    q_folded = set(tokenize_terms(cleaned_question, folded=True))
    matched_sentences: List[Tuple[float, int, str]] = []
    for score, idx, sent in ranked:
        s_folded = set(tokenize_terms(sent, folded=True))
        overlap = len(q_folded & s_folded)
        if overlap > 0 or any(len(qt) >= 3 and qt in _fold_vietnamese(sent) for qt in q_folded):
            matched_sentences.append((score, idx, sent))

    if matched_sentences:
        chosen = matched_sentences[:3]
        points = "\n".join(f"- {sent}" for _, _, sent in chosen)
        answer = f"Dựa trên nội dung bài '{ctx.title}', thông tin liên quan đến câu hỏi của bạn:\n{points}"
        for _, _, sent in chosen[:2]:
            citations.append(f'Trích dẫn: "{sent[:120]}"')
    else:
        fallback_points = "\n".join(f"- {sent}" for _, _, sent in sorted(ranked[:2], key=lambda item: item[1]))
        answer = (
            f"Nội dung hiện có của bài '{ctx.title}' chưa đề cập trực tiếp tới câu hỏi '{cleaned_question}'. "
            f"Bạn có thể tham khảo các ý chính có trong bài:\n{fallback_points}"
        )
        for _, _, sent in ranked[:1]:
            citations.append(f'Trích dẫn: "{sent[:120]}"')

    return AiTutorResponse(
        answer=answer,
        providerMode="LOCAL_FALLBACK",
        insufficientText=False,
        citations=citations,
    )


def run_lesson_tutor(
    db: Session,
    lesson: Lesson,
    course: Course,
    current_user: User,
    mode: TutorMode,
    question: Optional[str] = None,
) -> AiTutorResponse:
    """Answer lesson tutor requests using Gemini REST when configured, with Vietnamese extractive fallback."""
    ctx = _build_lesson_context(db, lesson, course.CourseId)
    cleaned_question = (question or "").strip()
    summary_text = f"[{mode}] {lesson.Title}" + (f" | {cleaned_question}" if cleaned_question else "")

    if ctx.insufficient_text:
        result = _local_lesson_tutor(ctx, mode, cleaned_question)
        _log_ai_interaction(db, current_user.UserId, course.CourseId, "LESSON_TUTOR", "LOCAL_FALLBACK", summary_text)
        return result

    if (settings.GEMINI_API_KEY or "").strip():
        mode_instructions = {
            "SUMMARY": "Tóm tắt súc tích các ý chính của bài học bằng tiếng Việt rõ ràng, chia gạch đầu dòng.",
            "EXPLAIN": "Giải thích chi tiết, dễ hiểu các khái niệm cốt lõi trong bài học bằng tiếng Việt.",
            "PRACTICE_QUESTIONS": (
                "Đề xuất 3 câu hỏi ôn tập ngắn kèm gợi ý trả lời dựa trên bài học để sinh viên tự kiểm tra. "
                "Tuyệt đối không tiết lộ hoặc bịa đáp án của bài kiểm tra chính thức."
            ),
            "QA": "Trả lời trực tiếp câu hỏi của sinh viên chỉ dựa trên ngữ cảnh bài học được cung cấp.",
        }
        system_prompt = (
            "Bạn là Trợ lý Học thuật AI của hệ thống University LMS. "
            "Luôn trả lời bằng tiếng Việt học thuật rõ ràng, chính xác, chỉ bám sát ngữ cảnh bài học được cung cấp. "
            "Không bịa thông tin ngoài bài học và không tiết lộ đáp án đề thi/quiz. "
            'Hãy trả về JSON hợp lệ dạng {"answer": "...", "citations": ["..."]}.'
        )
        user_prompt = (
            f"Môn học: {course.CourseCode} - {course.Title}\n"
            f"Chế độ: {mode} ({mode_instructions[mode]})\n"
            f"Câu hỏi của người học: {cleaned_question or 'Không có, hãy thực hiện theo chế độ đã chọn.'}\n\n"
            f"Ngữ cảnh bài học:\n{ctx.combined_text}"
        )
        raw_gemini = _call_gemini_generate_content(
            system_instruction=system_prompt,
            user_prompt=user_prompt,
            response_mime_type="application/json",
            temperature=0.25,
            max_output_tokens=1100,
        )
        if raw_gemini:
            parsed = _parse_json_block(raw_gemini)
            answer_text = ""
            citations: List[str] = list(ctx.citations)
            if isinstance(parsed, dict) and isinstance(parsed.get("answer"), str) and parsed["answer"].strip():
                answer_text = parsed["answer"].strip()
                raw_cites = parsed.get("citations")
                if isinstance(raw_cites, list):
                    for item in raw_cites:
                        item_str = str(item).strip()
                        if item_str and item_str not in citations:
                            citations.append(item_str)
            elif raw_gemini.strip():
                answer_text = raw_gemini.strip()

            if answer_text:
                _log_ai_interaction(db, current_user.UserId, course.CourseId, "LESSON_TUTOR", "GEMINI", summary_text)
                return AiTutorResponse(
                    answer=answer_text,
                    providerMode="GEMINI",
                    insufficientText=False,
                    citations=citations,
                )

    result = _local_lesson_tutor(ctx, mode, cleaned_question)
    _log_ai_interaction(db, current_user.UserId, course.CourseId, "LESSON_TUTOR", "LOCAL_FALLBACK", summary_text)
    return result


def _normalize_options_json(question_type: QuestionType, raw_options: Any) -> Optional[str]:
    if question_type == "SHORT_TEXT":
        return None
    if question_type == "TRUE_FALSE":
        return json.dumps({"true": "Đúng", "false": "Sai"}, ensure_ascii=False)
    if raw_options is None:
        return None
    if isinstance(raw_options, str):
        stripped = raw_options.strip()
        if not stripped:
            return None
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return None
    else:
        parsed = raw_options

    if isinstance(parsed, dict):
        cleaned = {str(k).strip(): str(v).strip() for k, v in parsed.items() if str(k).strip() and str(v).strip()}
        return json.dumps(cleaned, ensure_ascii=False) if cleaned else None
    if isinstance(parsed, list):
        return json.dumps(parsed, ensure_ascii=False)
    return None


def _validate_draft_question(candidate: AiQuizDraftQuestion) -> Optional[AiQuizDraftQuestion]:
    q_text = candidate.questionText.strip()[:1000]
    c_ans = candidate.correctAnswer.strip()[:500]
    if not q_text or not c_ans:
        return None
    score = float(candidate.score) if candidate.score and candidate.score > 0 else 1.0
    try:
        validate_question_contract(candidate.questionType, candidate.optionsJson, c_ans)
    except HTTPException:
        return None
    return AiQuizDraftQuestion(
        questionText=q_text,
        questionType=candidate.questionType,
        optionsJson=candidate.optionsJson,
        correctAnswer=c_ans,
        score=round(score, 2),
    )


def _extract_candidate_terms(text: str) -> List[str]:
    terms: List[str] = []
    seen: set[str] = set()
    for match in re.findall(r"[A-Za-z0-9_+#.-]{2,}|[^\W\d_]{3,}", text, flags=re.UNICODE):
        cleaned = match.strip(".,;:!?\"'()[]{}")
        lower = cleaned.casefold()
        if (
            len(lower) < 2
            or lower in VIETNAMESE_STOPWORDS
            or lower in seen
            or not any(ch.isalpha() for ch in cleaned)
        ):
            continue
        seen.add(lower)
        terms.append(cleaned)
    return terms


def _replace_whole_term(sentence: str, target: str, replacement: str) -> str:
    pattern = rf"(?<!\w){re.escape(target)}(?!\w)"
    return re.sub(pattern, replacement, sentence, count=1, flags=re.IGNORECASE)


def _build_local_quiz_questions(
    lesson_contexts: Sequence[LessonContext],
    count: int,
    question_types: Sequence[QuestionType],
) -> List[AiQuizDraftQuestion]:
    sentence_entries: List[Tuple[str, str]] = []
    full_corpus_parts: List[str] = []
    for ctx in lesson_contexts:
        body = "\n".join(part for part in (ctx.html_text, ctx.attachment_text) if part)
        if not body.strip():
            continue
        full_corpus_parts.append(body)
        for sent in split_sentences(body):
            sentence_entries.append((ctx.title, sent))

    if not sentence_entries:
        return []

    full_corpus = "\n".join(full_corpus_parts)
    ranked_pool = rank_sentences([sent for _, sent in sentence_entries])
    title_by_idx = {idx: title for idx, (title, _) in enumerate(sentence_entries)}
    ordered_entries = [(title_by_idx[idx], sent) for _, idx, sent in ranked_pool]

    term_pool = _extract_candidate_terms(full_corpus)
    option_keys = ["A", "B", "C", "D"]
    drafts: List[AiQuizDraftQuestion] = []

    for i in range(count):
        q_type = question_types[i % len(question_types)]
        lesson_title, sentence = ordered_entries[i % len(ordered_entries)]
        sent_terms = _extract_candidate_terms(sentence)
        focus_term = max(sent_terms, key=len) if sent_terms else lesson_title

        if q_type == "SINGLE_CHOICE":
            masked = _replace_whole_term(sentence, focus_term, "____")
            if masked == sentence:
                q_text = f"Theo bài '{lesson_title}', nội dung nào gắn trực tiếp với nhận định: \"{sentence[:220]}\"?"
            else:
                q_text = f"Điền thuật ngữ phù hợp vào chỗ trống theo bài '{lesson_title}': \"{masked[:240]}\""

            distractors: List[str] = []
            used_lower = {focus_term.casefold()}
            for candidate_term in term_pool:
                if candidate_term.casefold() not in used_lower:
                    used_lower.add(candidate_term.casefold())
                    distractors.append(candidate_term)
                if len(distractors) == 3:
                    break
            for fallback in _FALLBACK_DISTRACTORS:
                if len(distractors) == 3:
                    break
                if fallback.casefold() not in used_lower:
                    used_lower.add(fallback.casefold())
                    distractors.append(fallback)

            correct_slot = i % 4
            choices = list(distractors)
            choices.insert(correct_slot, focus_term)
            options_dict = {key: choices[idx] for idx, key in enumerate(option_keys)}
            draft = AiQuizDraftQuestion(
                questionText=q_text,
                questionType="SINGLE_CHOICE",
                optionsJson=json.dumps(options_dict, ensure_ascii=False),
                correctAnswer=option_keys[correct_slot],
                score=1.0,
            )

        elif q_type == "TRUE_FALSE":
            alt_terms = [t for t in term_pool if t.casefold() != focus_term.casefold()]
            make_false = (i % 2 == 1) and bool(alt_terms)
            if make_false:
                wrong_term = alt_terms[i % len(alt_terms)]
                statement = _replace_whole_term(sentence, focus_term, wrong_term)
                if statement != sentence:
                    q_text = f"Theo bài '{lesson_title}', nhận định sau đúng hay sai: \"{statement[:240]}\""
                    correct_ans = "false"
                else:
                    q_text = f"Theo bài '{lesson_title}', nhận định sau không liên quan tới {focus_term}: \"{sentence[:220]}\""
                    correct_ans = "false"
            else:
                q_text = f"Theo bài '{lesson_title}', nhận định sau đúng hay sai: \"{sentence[:240]}\""
                correct_ans = "true"

            draft = AiQuizDraftQuestion(
                questionText=q_text,
                questionType="TRUE_FALSE",
                optionsJson=json.dumps({"true": "Đúng", "false": "Sai"}, ensure_ascii=False),
                correctAnswer=correct_ans,
                score=1.0,
            )

        else:  # SHORT_TEXT
            q_text = (
                f"Dựa trên bài '{lesson_title}', hãy trình bày ngắn gọn kiến thức trọng tâm liên quan đến '{focus_term}'."
            )
            draft = AiQuizDraftQuestion(
                questionText=q_text,
                questionType="SHORT_TEXT",
                optionsJson=None,
                correctAnswer=sentence[:480],
                score=2.0,
            )

        validated = _validate_draft_question(draft)
        if validated is not None:
            drafts.append(validated)

    return drafts


def run_quiz_generate(
    db: Session,
    course: Course,
    lessons: Sequence[Lesson],
    current_user: User,
    count: int,
    question_types: Sequence[QuestionType],
) -> AiQuizGenerateResponse:
    """Generate draft quiz questions from lessons; every question passes validate_question_contract and nothing is persisted."""
    contexts = [_build_lesson_context(db, lesson, course.CourseId) for lesson in lessons]
    usable_contexts = [ctx for ctx in contexts if not ctx.insufficient_text]
    summary_text = f"[QUIZ_GENERATOR] course={course.CourseCode} lessons={len(lessons)} count={count}"

    if not usable_contexts:
        # Check if combined text across multiple sparse lessons still yields valid content
        combined_all = "\n".join(
            part for ctx in contexts for part in (ctx.html_text, ctx.attachment_text) if part
        ).strip()
        if len(re.sub(r"\s+", "", combined_all)) < 15 or len(tokenize_terms(combined_all)) < 3:
            _log_ai_interaction(
                db, current_user.UserId, course.CourseId, "QUIZ_GENERATOR", "LOCAL_FALLBACK", summary_text
            )
            return AiQuizGenerateResponse(
                questions=[],
                providerMode="LOCAL_FALLBACK",
                insufficientText=True,
            )
        usable_contexts = contexts

    if (settings.GEMINI_API_KEY or "").strip():
        context_blob = "\n\n---\n\n".join(ctx.combined_text for ctx in usable_contexts)[:MAX_CONTEXT_CHARS]
        allowed_types = ", ".join(question_types)
        system_prompt = (
            "Bạn là trợ lý soạn ngân hàng câu hỏi trắc nghiệm học thuật cho giảng viên đại học. "
            "Hãy tạo câu hỏi nháp bằng tiếng Việt chuẩn mực, bám sát ngữ cảnh bài học. "
            "Trả về JSON array gồm các đối tượng có đúng các trường: "
            "questionText (string), questionType (SINGLE_CHOICE|TRUE_FALSE|SHORT_TEXT), "
            "optionsJson (chuỗi JSON hoặc object với SINGLE_CHOICE là {\"A\":...,\"B\":...,\"C\":...,\"D\":...}, "
            "TRUE_FALSE là {\"true\":\"Đúng\",\"false\":\"Sai\"}, SHORT_TEXT là null), "
            "correctAnswer (A/B/C/D hoặc true/false hoặc đáp án tham khảo), score (số > 0). "
            "Tuyệt đối không đặt key chứa 'answer', 'correct', 'solution', 'explanation' bên trong optionsJson."
        )
        user_prompt = (
            f"Khóa học: {course.CourseCode} - {course.Title}\n"
            f"Số lượng câu hỏi cần tạo: {count}\n"
            f"Loại câu hỏi cho phép: {allowed_types}\n\n"
            f"Nội dung bài học:\n{context_blob}"
        )
        raw_gemini = _call_gemini_generate_content(
            system_instruction=system_prompt,
            user_prompt=user_prompt,
            response_mime_type="application/json",
            temperature=0.35,
            max_output_tokens=2048,
        )
        if raw_gemini:
            parsed = _parse_json_block(raw_gemini)
            raw_items: Any = parsed.get("questions") if isinstance(parsed, dict) else parsed
            if isinstance(raw_items, list):
                valid_questions: List[AiQuizDraftQuestion] = []
                allowed_set = set(question_types)
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    q_type_raw = str(item.get("questionType", "")).strip().upper()
                    if q_type_raw not in allowed_set:
                        continue
                    q_type: QuestionType = q_type_raw  # type: ignore[assignment]
                    raw_opts = item.get("optionsJson", item.get("options"))
                    opts_json = _normalize_options_json(q_type, raw_opts)
                    candidate = AiQuizDraftQuestion(
                        questionText=str(item.get("questionText", "")),
                        questionType=q_type,
                        optionsJson=opts_json,
                        correctAnswer=str(item.get("correctAnswer", "")),
                        score=float(item.get("score") or 1.0),
                    )
                    validated = _validate_draft_question(candidate)
                    if validated is not None:
                        valid_questions.append(validated)
                    if len(valid_questions) >= count:
                        break

                if valid_questions:
                    _log_ai_interaction(
                        db, current_user.UserId, course.CourseId, "QUIZ_GENERATOR", "GEMINI", summary_text
                    )
                    return AiQuizGenerateResponse(
                        questions=valid_questions,
                        providerMode="GEMINI",
                        insufficientText=False,
                    )

    local_questions = _build_local_quiz_questions(usable_contexts, count, question_types)
    _log_ai_interaction(
        db, current_user.UserId, course.CourseId, "QUIZ_GENERATOR", "LOCAL_FALLBACK", summary_text
    )
    return AiQuizGenerateResponse(
        questions=local_questions,
        providerMode="LOCAL_FALLBACK",
        insufficientText=len(local_questions) == 0,
    )


def _summarize_rubric_context(rubric_json: Optional[str], rubric_scores_json: Optional[str]) -> Tuple[List[str], List[str]]:
    strengths: List[str] = []
    improvements: List[str] = []
    if not rubric_scores_json:
        return strengths, improvements

    try:
        scores_obj = json.loads(rubric_scores_json)
    except (TypeError, ValueError):
        return strengths, improvements

    criteria_max: Dict[str, float] = {}
    if rubric_json:
        try:
            rubric_obj = json.loads(rubric_json)
            if isinstance(rubric_obj, list):
                for item in rubric_obj:
                    if isinstance(item, dict) and item.get("name") and item.get("maxScore"):
                        criteria_max[str(item["name"])] = float(item["maxScore"])
            elif isinstance(rubric_obj, dict):
                for key, val in rubric_obj.items():
                    if isinstance(val, (int, float)):
                        criteria_max[str(key)] = float(val)
        except (TypeError, ValueError):
            pass

    if isinstance(scores_obj, dict):
        for criterion, raw_val in scores_obj.items():
            if not isinstance(raw_val, (int, float)):
                continue
            val = float(raw_val)
            max_c = criteria_max.get(str(criterion))
            if max_c and max_c > 0:
                ratio = val / max_c
                if ratio >= 0.8:
                    strengths.append(f"{criterion} ({val:g}/{max_c:g})")
                elif ratio < 0.65:
                    improvements.append(f"{criterion} ({val:g}/{max_c:g})")
            elif val >= 4:
                strengths.append(f"{criterion} ({val:g})")
            elif val < 3:
                improvements.append(f"{criterion} ({val:g})")

    return strengths, improvements


def _local_feedback_suggest(
    assignment: Assignment,
    submission: Submission,
    assignment_file_text: str,
    submission_file_text: str,
    effective_score: Optional[float],
) -> str:
    max_score = float(assignment.MaxScore)
    desc_text = strip_html_to_text(assignment.Description)
    if assignment_file_text:
        desc_text = f"{desc_text}\n{assignment_file_text}".strip()

    sub_text = "\n".join(
        part for part in ((submission.ContentText or "").strip(), submission_file_text.strip()) if part
    ).strip()

    req_terms = set(tokenize_terms(desc_text, folded=True))
    sub_terms = set(tokenize_terms(sub_text, folded=True))
    matched_req = sorted(req_terms & sub_terms)[:4]
    missing_req = sorted(req_terms - sub_terms)[:3]
    rubric_strengths, rubric_improvements = _summarize_rubric_context(
        assignment.RubricJson, submission.RubricScoresJson
    )

    lines: List[str] = []
    if effective_score is not None and max_score > 0:
        ratio = max(0.0, min(1.0, effective_score / max_score))
        score_str = f"{effective_score:g}/{max_score:g}"
        if ratio >= 0.85:
            lines.append(
                f"Bài làm đạt kết quả rất tốt ({score_str}), đáp ứng đầy đủ các yêu cầu trọng tâm của '{assignment.Title}'."
            )
        elif ratio >= 0.65:
            lines.append(
                f"Bài làm đạt mức khá ({score_str}), thể hiện nắm được phần lớn nội dung của '{assignment.Title}'."
            )
        elif ratio >= 0.50:
            lines.append(
                f"Bài làm đạt mức trung bình ({score_str}); đã có hướng tiếp cận cơ bản nhưng còn cần hoàn thiện thêm."
            )
        else:
            lines.append(
                f"Bài làm chưa đạt yêu cầu ({score_str}) cho '{assignment.Title}'; cần rà soát lại yêu cầu đề bài và bổ sung phần còn thiếu."
            )
    else:
        lines.append(f"Gợi ý nhận xét bài nộp cho '{assignment.Title}':")

    if rubric_strengths:
        lines.append(f"Điểm mạnh theo rubric: {', '.join(rubric_strengths)}.")
    elif matched_req:
        lines.append("Nội dung bài nộp có đề cập đúng một số trọng tâm của đề bài.")
    elif sub_text:
        lines.append("Bài nộp có trình bày nội dung giải quyết vấn đề, cần đối chiếu kỹ hơn với tiêu chí đề bài.")
    else:
        lines.append("Bài nộp hiện chưa có nội dung văn bản hoặc tệp trích xuất được nội dung.")

    if rubric_improvements:
        lines.append(f"Cần cải thiện ở tiêu chí: {', '.join(rubric_improvements)}.")
    elif effective_score is not None and max_score > 0 and (effective_score / max_score) < 0.85:
        if missing_req:
            lines.append(
                "Gợi ý bổ sung: Cần trình bày rõ hơn các khía cạnh liên quan đến yêu cầu mô tả bài tập "
                "và kiểm tra kỹ trường hợp biên trước khi hoàn tất."
            )
        else:
            lines.append("Gợi ý bổ sung: Cần giải thích lập luận chi tiết hơn và bổ sung minh chứng/kết quả kiểm thử.")

    if submission.Status == "LATE":
        lines.append("Lưu ý: Bài được ghi nhận nộp sau thời hạn quy định.")

    return " ".join(lines).strip()


def run_feedback_suggest(
    db: Session,
    course: Course,
    assignment: Assignment,
    submission: Submission,
    current_user: User,
    score: Optional[float] = None,
) -> AiFeedbackSuggestResponse:
    """Suggest draft grading feedback for a submission without mutating the submission."""
    assignment_file_text = ""
    if assignment.AttachmentFileId is not None:
        asf = db.query(StoredFile).filter(StoredFile.FileId == assignment.AttachmentFileId).first()
        if asf and asf.ExtractedText:
            assignment_file_text = asf.ExtractedText.strip()

    submission_file_text = ""
    if submission.FileId is not None:
        ssf = db.query(StoredFile).filter(StoredFile.FileId == submission.FileId).first()
        if ssf and ssf.ExtractedText:
            submission_file_text = ssf.ExtractedText.strip()

    effective_score = score if score is not None else (float(submission.Score) if submission.Score is not None else None)
    max_score = float(assignment.MaxScore)
    score_note = f"{effective_score:g}/{max_score:g}" if effective_score is not None else "chưa chấm"
    summary_text = f"[GRADING_FEEDBACK] assignment={assignment.Title} score={score_note}"

    if (settings.GEMINI_API_KEY or "").strip():
        desc_text = strip_html_to_text(assignment.Description)
        sub_content = (submission.ContentText or "").strip()
        system_prompt = (
            "Bạn là trợ lý hỗ trợ giảng viên chấm bài đại học. "
            "Hãy viết 1 đoạn nhận xét nháp ngắn gọn (2-4 câu), mang tính xây dựng, bằng tiếng Việt chuẩn mực, "
            "phù hợp với thang điểm/rubric và nội dung bài làm. "
            'Trả về JSON hợp lệ dạng {"suggestedFeedback": "..."}.'
        )
        user_prompt = (
            f"Môn học: {course.CourseCode} - {course.Title}\n"
            f"Bài tập: {assignment.Title}\n"
            f"Mô tả đề bài: {desc_text[:3000]}\n"
            f"Tài liệu đính kèm đề bài: {assignment_file_text[:2000]}\n"
            f"Rubric đề bài: {(assignment.RubricJson or 'Không có')[:1500]}\n"
            f"Điểm dự kiến: {score_note}\n"
            f"Trạng thái nộp bài: {submission.Status}\n"
            f"Điểm rubric: {(submission.RubricScoresJson or 'Không có')[:1000]}\n"
            f"Nội dung bài nộp: {sub_content[:4000]}\n"
            f"Nội dung trích xuất từ tệp bài nộp: {submission_file_text[:4000]}"
        )
        raw_gemini = _call_gemini_generate_content(
            system_instruction=system_prompt,
            user_prompt=user_prompt,
            response_mime_type="application/json",
            temperature=0.3,
            max_output_tokens=600,
        )
        if raw_gemini:
            parsed = _parse_json_block(raw_gemini)
            feedback_text = ""
            if isinstance(parsed, dict) and isinstance(parsed.get("suggestedFeedback"), str):
                feedback_text = parsed["suggestedFeedback"].strip()
            elif raw_gemini.strip():
                feedback_text = raw_gemini.strip()

            if feedback_text:
                _log_ai_interaction(
                    db, current_user.UserId, course.CourseId, "GRADING_FEEDBACK", "GEMINI", summary_text
                )
                return AiFeedbackSuggestResponse(
                    suggestedFeedback=feedback_text[:2000],
                    providerMode="GEMINI",
                )

    fallback_feedback = _local_feedback_suggest(
        assignment=assignment,
        submission=submission,
        assignment_file_text=assignment_file_text,
        submission_file_text=submission_file_text,
        effective_score=effective_score,
    )
    _log_ai_interaction(
        db, current_user.UserId, course.CourseId, "GRADING_FEEDBACK", "LOCAL_FALLBACK", summary_text
    )
    return AiFeedbackSuggestResponse(
        suggestedFeedback=fallback_feedback[:2000],
        providerMode="LOCAL_FALLBACK",
    )
