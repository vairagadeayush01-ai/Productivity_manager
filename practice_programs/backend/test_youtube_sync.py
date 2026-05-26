import requests
import json

req_body = {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    "channel": "Rick Astley",
    "duration": "3:33",
    "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg",
    "isEducational": False,
    "confidence": 95,
    "watchTime": 100,
    "completion": 50,
    "firstSeen": "2026-05-25T10:00:00Z",
    "lastWatched": "2026-05-25T10:05:00Z",
    "rewatchCount": 0
}

# Need to login first to get token
login_res = requests.post("http://localhost:8000/auth/login", data={"username": "vairagadeayush01@gmail.com", "password": "password"}) # assuming password is password, or I can create a new user.
print(login_res.status_code)
if login_res.status_code != 200:
    print("Login failed, response:", login_res.text)
else:
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    res = requests.post("http://localhost:8000/ingest/youtube/sync", json=req_body, headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text)
