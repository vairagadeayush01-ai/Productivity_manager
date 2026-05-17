import requests
from datetime import datetime, UTC

USERNAME = "Ayush6058"

url = f"https://api.github.com/users/{USERNAME}/events"

response = requests.get(url)

events = response.json()

print(events)   # DEBUG

today = datetime.now(UTC).date()

print("\nToday's GitHub Activity:\n")

count = 0

for event in events:

    created_at = event["created_at"]

    event_date = datetime.strptime(
        created_at,
        "%Y-%m-%dT%H:%M:%SZ"
    ).date()

    if event_date != today:
        continue

    event_type = event["type"]

    repo_name = event["repo"]["name"]

    if event_type == "PushEvent":

        commits = event["payload"]["commits"]

        for commit in commits:

            count += 1

            print(f"{count}. Repo: {repo_name}")

            print(f"   Commit: {commit['message']}")

            print()

print(f"Total commits today: {count}")