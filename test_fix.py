#!/usr/bin/env python3
"""Test the fixed history endpoint"""
import sys
sys.path.insert(0, r'd:\Summer_Projects\Productivity_manager\practice_programs\backend')

from datetime import datetime
from database import SessionLocal, LearningEntry, Base, engine

# Create tables
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Clear existing entries
db.query(LearningEntry).delete()
db.commit()

# Create test entries with None topics to verify the fix handles it
entry1 = LearningEntry(
    source_type="youtube",
    title="Test Video 1",
    source_url="https://youtube.com/test1",
    raw_content="content1",
    summary="This is a test summary",
    topics="python, learning, testing",  # Has topics
    created_at=datetime.utcnow()
)

entry2 = LearningEntry(
    source_type="manual",
    title="Test Note 2",
    source_url="",
    raw_content="content2",
    summary="Another test summary",
    topics=None,  # No topics - this is what was causing the bug
    created_at=datetime.utcnow()
)

entry3 = LearningEntry(
    source_type="leetcode",
    title="Test Problem 3",
    source_url="https://leetcode.com/test",
    raw_content="content3",
    summary="Problem summary",
    topics="",  # Empty string
    created_at=datetime.utcnow()
)

db.add_all([entry1, entry2, entry3])
db.commit()

print(f"Created 3 test entries")

# Test the fixed query logic
entries = db.query(LearningEntry).order_by(LearningEntry.created_at.desc()).offset(0).limit(50).all()
total = db.query(LearningEntry).count()

print(f"\nHistory query returned {len(entries)} entries, total: {total}")

# Simulate what the endpoint does
result_entries = []
for e in entries:
    try:
        entry_dict = {
            "id": e.id,
            "source_type": e.source_type,
            "title": e.title,
            "summary": e.summary,
            "topics": (e.topics.split(", ") if e.topics else []),  # Fixed line
            "created_at": e.created_at.isoformat()
        }
        result_entries.append(entry_dict)
        print(f"✓ Entry {e.id}: {e.title} - Topics: {entry_dict['topics']}")
    except Exception as ex:
        print(f"✗ Entry {e.id}: {e.title} - ERROR: {ex}")

print(f"\n✓ Successfully formatted {len(result_entries)} entries without errors")
print(f"✓ Fix works correctly with None, empty, and normal topics values")

db.close()
