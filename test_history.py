#!/usr/bin/env python3
"""Test script to check history endpoint and database"""
import sys
sys.path.insert(0, r'd:\Summer_Projects\Productivity_manager\practice_programs\backend')

from database import SessionLocal, LearningEntry

db = SessionLocal()

# Check total entries
total = db.query(LearningEntry).count()
print(f"Total entries in database: {total}")

# Get all entries
entries = db.query(LearningEntry).order_by(LearningEntry.created_at.desc()).all()
print(f"\nAll entries ({len(entries)}):")
for e in entries:
    print(f"  ID: {e.id}, Title: {e.title[:50]}, Created: {e.created_at}")

# Test the exact query used in /history endpoint
history_query = db.query(LearningEntry).order_by(LearningEntry.created_at.desc()).offset(0).limit(50).all()
print(f"\nHistory query result ({len(history_query)} entries):")
for e in history_query:
    print(f"  ID: {e.id}, Title: {e.title[:50]}, Created: {e.created_at}")

db.close()
