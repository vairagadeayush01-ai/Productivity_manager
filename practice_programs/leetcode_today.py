import requests
from datetime import datetime

USERNAME = "Ayush6058"

url = "https://leetcode.com/graphql"

query = """
query recentAcSubmissions($username: String!) {
  recentAcSubmissionList(username: $username) {
    title
    titleSlug
    timestamp
  }
}
"""

response = requests.post(
    url,
    json={
        "query": query,
        "variables": {"username": USERNAME}
    }
)

data = response.json()

submissions = data["data"]["recentAcSubmissionList"]

today = datetime.now().date()

solved_today = []
seen = set()

for sub in submissions:
    problem_name = sub["title"]

    submission_date = datetime.fromtimestamp(
        int(sub["timestamp"])
    ).date()

    if submission_date == today and problem_name not in seen:
        solved_today.append(problem_name)
        seen.add(problem_name)

print(f"\nProblems solved today: {len(solved_today)}\n")

for i, problem in enumerate(solved_today, start=1):
    print(f"{i}. {problem}")