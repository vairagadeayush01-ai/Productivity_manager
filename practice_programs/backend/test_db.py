import sqlite3
conn = sqlite3.connect('learning_tracker.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
c.execute("SELECT title, summary, raw_content, source_url, metadata_json FROM learning_entries WHERE source_type='youtube'")
rows = c.fetchall()
for r in rows:
    print('Title:', r['title'])
    print('Summary len:', len(r['summary']) if r['summary'] else 'None')
    print('Raw content len:', len(r['raw_content']) if r['raw_content'] else 'None')
    print('Metadata:', r['metadata_json'])
    print('---')
conn.close()
