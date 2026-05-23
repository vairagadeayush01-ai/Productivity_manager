"""
test_summarizer.py — tests for the Groq circuit breaker and retry logic.
"""

import pytest
import time
from unittest.mock import patch, MagicMock

from services.summarizer import _breaker, _CircuitBreaker, summarize_transcript, _call_groq


class TestCircuitBreaker:
    def setup_method(self):
        """Reset breaker state before each test."""
        _breaker._failures = 0
        _breaker._state = _breaker.CLOSED
        _breaker._opened_at = None

    def test_starts_closed(self):
        """Circuit breaker should start in CLOSED state."""
        cb = _CircuitBreaker(failure_threshold=3)
        assert cb.state == cb.CLOSED
        assert not cb.is_open()

    def test_opens_after_threshold(self):
        """After N failures, circuit should OPEN."""
        cb = _CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == cb.CLOSED
        cb.record_failure()  # 3rd failure → trips
        assert cb.state == cb.OPEN
        assert cb.is_open()

    def test_success_resets_failures(self):
        """A success should reset the failure counter and close the circuit."""
        cb = _CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb._failures == 0
        assert cb.state == cb.CLOSED

    def test_transitions_to_half_open_after_timeout(self):
        """After recovery_timeout, an OPEN circuit should become HALF-OPEN."""
        cb = _CircuitBreaker(failure_threshold=1, recovery_timeout=0.1)
        cb.record_failure()  # Opens immediately
        assert cb.is_open()
        time.sleep(0.15)
        assert cb.state == cb.HALF_OPEN

    def test_global_breaker_blocks_when_open(self):
        """_call_groq should raise RuntimeError when circuit is open."""
        _breaker._state = _breaker.OPEN
        _breaker._opened_at = time.monotonic()  # Keep it open
        with pytest.raises(RuntimeError, match="circuit breaker open"):
            _call_groq("test prompt")

    def test_groq_failure_increments_breaker(self):
        """A Groq API failure should be recorded by the breaker."""
        _breaker._state = _breaker.CLOSED
        _breaker._failures = 0
        with patch("services.summarizer.client") as mock_client:
            mock_client.chat.completions.create.side_effect = Exception("API Error")
            with pytest.raises(Exception):
                # tenacity will retry 3 times, each incrementing failures
                _call_groq.__wrapped__("test")  # Call without tenacity wrapper
        assert _breaker._failures >= 1


class TestSummarizer:
    def test_summarize_transcript_returns_dict(self):
        """summarize_transcript should return a dict with expected keys."""
        with patch("services.summarizer._call_groq") as mock_groq:
            mock_groq.return_value = '{"summary": "Test summary", "topics": ["python"], "key_concepts": []}'
            result = summarize_transcript("Some text about Python", "Python Tutorial")
        assert isinstance(result, dict)
        assert "summary" in result
        assert "topics" in result
        assert "key_concepts" in result
        assert result["summary"] == "Test summary"

    def test_summarize_handles_malformed_json(self):
        """If Groq returns non-JSON, should return a fallback dict."""
        with patch("services.summarizer._call_groq") as mock_groq:
            mock_groq.return_value = "This is just plain text, not JSON."
            result = summarize_transcript("content", "title")
        assert isinstance(result, dict)
        assert "summary" in result  # Fallback dict

    def test_long_text_is_truncated(self):
        """Texts longer than 60K chars should be truncated before sending."""
        long_text = "a" * 70_000
        with patch("services.summarizer._call_groq") as mock_groq:
            mock_groq.return_value = '{"summary": "s", "topics": [], "key_concepts": []}'
            summarize_transcript(long_text, "Long")
        # Verify the prompt sent to Groq contains the truncation marker
        call_args = mock_groq.call_args[0][0]
        assert "[content truncated]" in call_args
