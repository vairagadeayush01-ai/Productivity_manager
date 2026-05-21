from database import SessionLocal
from datetime import date
from routes.diary import generate_diary_for_date

if __name__ == "__main__":
    db = SessionLocal()
    try:
        today_str = date.today().isoformat()
        print(f"Generating diary for {today_str}...")
        generate_diary_for_date(db, today_str)
        print("Done!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()
