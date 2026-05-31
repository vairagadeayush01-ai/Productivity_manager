"""
test_summarizer.py — tests for the summarizer service.
"""

import pytest
from unittest.mock import patch, MagicMock

from services.summarizer import summarize_transcript, summarize_manual_log, summarize_daily_diary


class TestSummarizer:
    @patch("services.summarizer._get_llm")
    def test_summarize_transcript_success(self, mock_get_llm):
        """summarize_transcript should return a dict with expected keys."""
        mock_chain = MagicMock()
        mock_chain.with_structured_output.return_value.with_retry.return_value.with_fallbacks.return_value.invoke.return_value.model_dump.return_value = {
            "summary": "Test summary",
            "topics": ["python"],
            "key_concepts": []
        }
        mock_get_llm.return_value = mock_chain
        
        result = summarize_transcript("Some text about Python", "Python Tutorial")
        assert isinstance(result, dict)
        assert "summary" in result
        assert "topics" in result
        assert result["summary"] == "Test summary"

    @patch("services.summarizer._get_llm")
    def test_summarize_transcript_fallback(self, mock_get_llm):
        """If _get_llm returns None, fallback is used."""
        mock_get_llm.return_value = None
        result = summarize_transcript("content", "title")
        assert isinstance(result, dict)
        assert "summary" in result
        assert "Content saved, but AI summarization failed" in result["summary"]

    @patch("services.summarizer._get_llm")
    def test_long_text_is_truncated(self, mock_get_llm):
        """Texts longer than 60K chars should be truncated before sending."""
        mock_invoke = MagicMock()
        mock_chain = MagicMock()
        mock_chain.with_structured_output.return_value.with_retry.return_value.with_fallbacks.return_value = mock_invoke
        mock_invoke.invoke.return_value.model_dump.return_value = {
            "summary": "Truncated summary", "topics": [], "key_concepts": []
        }
        mock_get_llm.return_value = mock_chain

        long_text = "a" * 70_000
        summarize_transcript(long_text, "Long")
        
        # Verify the prompt sent to Groq contains the truncation marker
        call_args = mock_invoke.invoke.call_args[0][0]
        assert "[content truncated]" in call_args

    @patch("services.summarizer._get_llm")
    def test_summarize_manual_log_success(self, mock_get_llm):
        mock_chain = MagicMock()
        mock_chain.with_structured_output.return_value.with_retry.return_value.with_fallbacks.return_value.invoke.return_value.model_dump.return_value = {
            "summary": "Manual summary", "topics": [], "key_concepts": []
        }
        mock_get_llm.return_value = mock_chain
        
        result = summarize_manual_log("Learned testing")
        assert result["summary"] == "Manual summary"

    @patch("services.summarizer._get_llm")
    def test_summarize_daily_diary_success(self, mock_get_llm):
        mock_invoke = MagicMock()
        # Diary returns raw string, so we mock the chain differently
        mock_invoke.invoke.return_value = "Today was a good day."
        mock_chain = MagicMock()
        # Mocking the `| StrOutputParser()` bit
        mock_chain.__or__.return_value.with_retry.return_value.with_fallbacks.return_value = mock_invoke
        mock_get_llm.return_value = mock_chain
        
        result = summarize_daily_diary("Activities", "2024-01-01")
        assert result == "Today was a good day."
