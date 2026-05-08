# Gameserver to Backend Integration Guide

This guide explains how to integrate the Fortnite gameserver (Erbium) with the Reload Backend to track quest progress and XP events.

## Overview

The gameserver can now send quest progress, objective completions, and XP events to the backend, which persists the data in MongoDB. When players return to the lobby, they can retrieve their progress from the previous match.

## API Endpoints

### 1. Quest Progress Update
**Endpoint:** `POST /gameserver/quest/progress`

Send this whenever quest progress changes during a match.

**Request Body:**
```json
{
  "accountId": "player-account-id",
  "questId": "quest-template-id",
  "questName": "Quest Display Name",
  "objectives": [
    {
      "objectiveName": "Kill 5 Enemies",
      "backendName": "kill_5_enemies",
      "currentProgress": 3,
      "requiredProgress": 5,
      "completed": false
    },
    {
      "objectiveName": "Visit Named Location",
      "backendName": "visit_named",
      "currentProgress": 1,
      "requiredProgress": 1,
      "completed": true
    }
  ],
  "matchId": "00000000-0000-0000-0000-000000000000"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quest progress recorded",
  "questId": "quest-template-id"
}
```

**HTTP Status Codes:**
- `200`: Success
- `400`: Missing required fields
- `500`: Server error

---

### 2. Objective Completion
**Endpoint:** `POST /gameserver/quest/objective-completed`

Send when a single objective is completed.

**Request Body:**
```json
{
  "accountId": "player-account-id",
  "questId": "quest-template-id",
  "objectiveName": "Kill 5 Enemies",
  "currentProgress": 5,
  "requiredProgress": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Objective progress recorded",
  "objectiveName": "Kill 5 Enemies",
  "progress": 5,
  "required": 5
}
```

---

### 3. Quest Completion
**Endpoint:** `POST /gameserver/quest/completed`

Send when the entire quest is completed.

**Request Body:**
```json
{
  "accountId": "player-account-id",
  "questId": "quest-template-id",
  "xpRewards": 1500,
  "accolades": [
    {
      "name": "Quest Completer",
      "id": "accolade-quest-complete",
      "xpValue": 500
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quest completion recorded",
  "questId": "quest-template-id",
  "xpRewards": 1500,
  "accolades": [
    {
      "name": "Quest Completer",
      "id": "accolade-quest-complete",
      "xpValue": 500
    }
  ]
}
```

---

### 4. XP Event
**Endpoint:** `POST /gameserver/xp/event`

Send for various XP events during match (kills, objectives, etc).

**Request Body:**
```json
{
  "accountId": "player-account-id",
  "eventType": "kill",
  "xpAmount": 250,
  "eventData": {
    "source": "player_kill",
    "targetName": "EnemyPlayerName",
    "weaponType": "Assault_Rifle"
  }
}
```

**Supported Event Types:**
- `kill` - Player kill
- `assist` - Kill assist
- `objective_complete` - Objective completion
- `match_complete` - Match completion bonus
- `placement_bonus` - Placement based bonus
- `accolade` - Accolade earned
- `custom` - Custom event

**Response:**
```json
{
  "success": true,
  "message": "XP event recorded",
  "accountId": "player-account-id",
  "xpAmount": 250,
  "totalXP": 5250
}
```

---

### 5. Get Quest Progress (Client)
**Endpoint:** `GET /client/quest/progress/:accountId/:questId`

Client calls this when returning to lobby to retrieve saved progress.

**Response:**
```json
{
  "success": true,
  "questProgress": {
    "_id": "mongodb-id",
    "accountId": "player-account-id",
    "questId": "quest-template-id",
    "questName": "Quest Name",
    "objectives": [
      {
        "objectiveName": "Kill 5 Enemies",
        "backendName": "kill_5_enemies",
        "currentProgress": 3,
        "requiredProgress": 5,
        "completed": false
      }
    ],
    "questCompleted": false,
    "xpRewardsEarned": 0,
    "accoladesEarned": [],
    "lastUpdated": "2026-05-08T12:00:00.000Z",
    "matchId": "match-guid"
  }
}
```

---

### 6. Get All Quests (Client)
**Endpoint:** `GET /client/quests/all/:accountId`

Get all quest progress for a player.

**Response:**
```json
{
  "success": true,
  "totalQuests": 5,
  "completedQuests": 2,
  "quests": [
    {
      "_id": "mongodb-id",
      "accountId": "player-account-id",
      "questId": "quest-1",
      "questName": "Quest 1",
      "objectives": [...],
      "questCompleted": true,
      "xpRewardsEarned": 1500,
      "accoladesEarned": [...],
      "lastUpdated": "2026-05-08T12:00:00.000Z"
    }
  ]
}
```

---

### 7. Get Quest Statistics (Client)
**Endpoint:** `GET /client/quest/stats/:accountId`

Get quest completion statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "accountId": "player-account-id",
    "totalQuests": 10,
    "completedQuests": 7,
    "completionRate": 70,
    "totalXpEarned": 15000,
    "totalAccolades": 12,
    "lastUpdated": "2026-05-08T12:00:00.000Z"
  }
}
```

---

### 8. Reset Quest Progress (Admin)
**Endpoint:** `DELETE /gameserver/quest/reset/:accountId/:questId`

Reset a specific quest for a player (admin only, in production add auth check).

**Response:**
```json
{
  "success": true,
  "message": "Quest progress reset"
}
```

---

## Implementation in C++ Gameserver (FortQuestManager)

### 1. Include Headers

Add to `FortQuestManager.cpp`:

```cpp
#include <curl/curl.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
```

### 2. Helper Function - Send HTTP Request

```cpp
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* userp) {
    userp->append((char*)contents, size * nmemb);
    return size * nmemb;
}

void SendHttpRequest(const FString& Endpoint, const FString& JsonPayload, const FString& Method = TEXT("POST")) {
    CURL* curl = curl_easy_init();
    if (!curl) {
        UE_LOG(LogTemp, Warning, TEXT("Failed to initialize CURL"));
        return;
    }

    // Construct full URL
    FString BackendURL = TEXT("http://YOUR_BACKEND_IP:3000");
    FString FullURL = BackendURL + Endpoint;

    std::string url_str(TCHAR_TO_UTF8(*FullURL));
    std::string json_str(TCHAR_TO_UTF8(*JsonPayload));
    std::string response;

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, url_str.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_str.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 5L);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        UE_LOG(LogTemp, Warning, TEXT("CURL request failed: %s"), UTF8_TO_TCHAR(curl_easy_strerror(res)));
    }

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
}
```

### 3. Hook Into Quest Progress

Modify the `ProgressQuest` function:

```cpp
void ProgressQuest(UFortQuestManager* _this, AFortPlayerControllerAthena* PlayerController, 
    UFortQuestItem* QuestItem, FName BackendName, int Count)
{
    // ... existing code ...

    // Build objectives array
    json objectives = json::array();
    for (auto& Objective : QuestItem->Objectives)
    {
        objectives.push_back({
            {"objectiveName", std::string(TCHAR_TO_UTF8(*Objective->BackendName.ToString()))},
            {"backendName", std::string(TCHAR_TO_UTF8(*Objective->BackendName.ToString()))},
            {"currentProgress", AcheivedCount + Count},
            {"requiredProgress", Objective->RequiredCount},
            {"completed", (AcheivedCount + Count) >= Objective->RequiredCount}
        });
    }

    // Create JSON payload
    json payload = {
        {"accountId", std::string(TCHAR_TO_UTF8(*PlayerController->GetAccountId()))},
        {"questId", std::string(TCHAR_TO_UTF8(*QuestItem->ItemDefinition->Name.ToString()))},
        {"questName", std::string(TCHAR_TO_UTF8(*QuestItem->ItemDefinition->DisplayName.ToString()))},
        {"objectives", objectives},
        {"matchId", std::string(TCHAR_TO_UTF8(*FGuid::NewGuid().ToString()))}
    };

    SendHttpRequest(TEXT("/gameserver/quest/progress"), FString(UTF8_TO_TCHAR(payload.dump().c_str())));

    // ... rest of existing code ...
}
```

### 4. Hook Into Quest Completion

Add to `ProgressQuest` or create new function:

```cpp
void OnQuestCompleted(AFortPlayerControllerAthena* PlayerController, UFortQuestItemDefinition* QuestDef, int32 XpRewards, const TArray<FAccoladeReward>& Accolades)
{
    json accolades_json = json::array();
    for (const auto& Accolade : Accolades)
    {
        accolades_json.push_back({
            {"name", std::string(TCHAR_TO_UTF8(*Accolade.DisplayName.ToString()))},
            {"id", std::string(TCHAR_TO_UTF8(*Accolade.Id.ToString()))},
            {"xpValue", Accolade.XpValue}
        });
    }

    json payload = {
        {"accountId", std::string(TCHAR_TO_UTF8(*PlayerController->GetAccountId()))},
        {"questId", std::string(TCHAR_TO_UTF8(*QuestDef->Name.ToString()))},
        {"xpRewards", XpRewards},
        {"accolades", accolades_json}
    };

    SendHttpRequest(TEXT("/gameserver/quest/completed"), FString(UTF8_TO_TCHAR(payload.dump().c_str())));
}
```

### 5. Hook Into XP Events

Modify `SendStatEvent__Internal`:

```cpp
void UFortQuestManager::SendStatEvent__Internal(AActor* PlayerController, long long StatEvent, int32 Count, UObject* TargetObject, ...)
{
    // ... existing code ...

    // Send to backend
    json eventData = {
        {"accountId", std::string(TCHAR_TO_UTF8(*((AFortPlayerControllerAthena*)PlayerController)->GetAccountId()))},
        {"eventType", std::string(TCHAR_TO_UTF8(*GetStatEventName(StatEvent)))},
        {"xpAmount", Count},
        {"eventData", {
            {"source", "quest_event"},
            {"timestamp", std::string(TCHAR_TO_UTF8(*FDateTime::Now().ToString()))}
        }}
    };

    SendHttpRequest(TEXT("/gameserver/xp/event"), FString(UTF8_TO_TCHAR(eventData.dump().c_str())));

    // ... rest of existing code ...
}
```

---

## Configuration

Update your backend URL in the C++ code:

```cpp
FString BackendURL = TEXT("http://192.168.1.100:3000");  // Change to your backend IP:PORT
```

---

## Testing

Use Postman or curl to test endpoints:

```bash
# Test quest progress update
curl -X POST http://localhost:3000/gameserver/quest/progress \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "test-account",
    "questId": "quest-001",
    "questName": "Test Quest",
    "objectives": [
      {
        "objectiveName": "Kill 5",
        "backendName": "kill_5",
        "currentProgress": 3,
        "requiredProgress": 5,
        "completed": false
      }
    ],
    "matchId": "match-001"
  }'

# Get quest progress
curl -X GET http://localhost:3000/client/quest/progress/test-account/quest-001
```

---

## Data Persistence

All quest data is stored in MongoDB in the `questProgress` collection with the following structure:

```json
{
  "_id": "ObjectId",
  "accountId": "string",
  "questId": "string",
  "questName": "string",
  "objectives": [
    {
      "objectiveName": "string",
      "backendName": "string",
      "currentProgress": "number",
      "requiredProgress": "number",
      "completed": "boolean",
      "completedAt": "Date"
    }
  ],
  "questCompleted": "boolean",
  "completedAt": "Date",
  "xpRewardsEarned": "number",
  "accoladesEarned": [
    {
      "accoladeName": "string",
      "accoladeId": "string",
      "xpValue": "number",
      "earnedAt": "Date"
    }
  ],
  "lastUpdated": "Date",
  "matchId": "string"
}
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (missing fields)
- `404`: Not Found (quest progress doesn't exist)
- `500`: Internal Server Error

Error responses include a `details` field with the error message:

```json
{
  "error": "Internal server error",
  "details": "Detailed error message here"
}
```

---

## Security Considerations

In production, consider adding:

1. **Authentication**: Verify gameserver token before accepting requests
2. **Rate Limiting**: Prevent spam from misconfigured servers
3. **Input Validation**: Validate all incoming data
4. **IP Whitelisting**: Only allow requests from known gameserver IPs

---

## Support

For issues or questions, refer to the API logs available in the backend console.
