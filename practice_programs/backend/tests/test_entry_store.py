from services import entry_store


def test_save_entry_creates_record(db):
    result = entry_store.save_entry(
        db,
        user_id=1,
        source_type="manual",
        title="Test Title",
        source_url="",
        raw_content="Some content",
        summary_result={
            "summary": "A test summary",
            "topics": ["testing", "python"],
            "key_concepts": [],
        },
    )
    assert result["id"] is not None
    assert result["title"] == "Test Title"
    assert "testing" in result["topics"]


def test_dedupe_same_title_today(db):
    summary = {
        "summary": "GitHub activity",
        "topics": ["github"],
        "key_concepts": [],
    }
    r1 = entry_store.save_entry(
        db,
        user_id=1,
        source_type="github",
        title="GitHub — 2 commit(s)",
        source_url="https://github.com/u",
        raw_content="commits...",
        summary_result=summary,
        dedupe_same_title_today=True,
    )
    r2 = entry_store.save_entry(
        db,
        user_id=1,
        source_type="github",
        title="GitHub — 2 commit(s)",
        source_url="https://github.com/u",
        raw_content="commits again...",
        summary_result=summary,
        dedupe_same_title_today=True,
    )
    assert r1["id"] == r2["id"]
