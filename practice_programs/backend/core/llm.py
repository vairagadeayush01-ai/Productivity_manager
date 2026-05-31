import os
import logging
from typing import Any
import groq
from groq import Groq
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)

_groq_client: Groq | None = None

def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set.")
        _groq_client = Groq(api_key=api_key)
    return _groq_client

def get_model(default_model: str = "llama-3.3-70b-versatile") -> str:
    """Returns the primary Groq model configured in env, or the default."""
    return os.getenv("GROQ_MODEL", default_model)

def get_fallback_model() -> str:
    """Returns the fallback model to use when a rate limit is hit."""
    return os.getenv("GROQ_FALLBACK_MODEL", "qwen/qwen3-32b")

def create_chat_completion(
    messages: list[dict[str, Any]],
    temperature: float = 0.4,
    max_tokens: int = 900,
    stream: bool = False,
    default_model: str = "llama-3.3-70b-versatile",
    **kwargs: Any
) -> Any:
    """
    Creates a chat completion with automatic fallback to qwen/qwen3-32b
    if a RateLimitError (429) is encountered.
    """
    client = get_groq_client()
    primary_model = get_model(default_model)
    fallback_model = get_fallback_model()

    try:
        logger.info(f"LLM request: model={primary_model}, stream={stream}")
        return client.chat.completions.create(
            model=primary_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            **kwargs
        )
    except groq.RateLimitError as exc:
        if primary_model != fallback_model:
            logger.warning(
                f"Rate limit hit for model {primary_model}. "
                f"Falling back to {fallback_model}. Error: {exc}"
            )
            return client.chat.completions.create(
                model=fallback_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
                **kwargs
            )
        else:
            logger.error(f"Rate limit hit on fallback model {fallback_model}.")
            raise exc

def get_chat_groq(
    temperature: float = 0.3,
    max_tokens: int = 1024,
    default_model: str = "llama-3.3-70b-versatile",
    **kwargs: Any
) -> Any:
    """
    Returns a LangChain ChatGroq instance configured with fallback
    for when the primary model encounters a rate limit.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None

    primary_model = get_model(default_model)
    fallback_model = get_fallback_model()

    primary_llm = ChatGroq(
        model=primary_model,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=api_key,
        **kwargs
    )

    if primary_model == fallback_model:
        return primary_llm

    fallback_llm = ChatGroq(
        model=fallback_model,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=api_key,
        **kwargs
    )

    return primary_llm.with_fallbacks([fallback_llm])
