const log = require("../structs/log.js");

/**
 * Gameserver Integration Module
 * 
 * This module provides utilities for the Fortnite gameserver to communicate
 * quest progress and XP events back to the backend.
 * 
 * Usage in C++ Gameserver Code:
 * 
 * 1. Quest Progress Update:
 *    POST /gameserver/quest/progress
 *    Body: {
 *        "accountId": "account-id",
 *        "questId": "quest-id",
 *        "questName": "Quest Name",
 *        "objectives": [
 *            {
 *                "objectiveName": "Objective 1",
 *                "backendName": "objective_backend_name",
 *                "currentProgress": 5,
 *                "requiredProgress": 10,
 *                "completed": false
 *            }
 *        ],
 *        "matchId": "match-guid"
 *    }
 * 
 * 2. Objective Completion:
 *    POST /gameserver/quest/objective-completed
 *    Body: {
 *        "accountId": "account-id",
 *        "questId": "quest-id",
 *        "objectiveName": "Objective 1",
 *        "currentProgress": 10,
 *        "requiredProgress": 10
 *    }
 * 
 * 3. Quest Completion:
 *    POST /gameserver/quest/completed
 *    Body: {
 *        "accountId": "account-id",
 *        "questId": "quest-id",
 *        "xpRewards": 1000,
 *        "accolades": [
 *            {
 *                "name": "Accolade Name",
 *                "id": "accolade-id",
 *                "xpValue": 100
 *            }
 *        ]
 *    }
 * 
 * 4. XP Event:
 *    POST /gameserver/xp/event
 *    Body: {
 *        "accountId": "account-id",
 *        "eventType": "match_complete|kill|objective_complete|etc",
 *        "xpAmount": 250,
 *        "eventData": {
 *            "source": "kill",
 *            "targetName": "Enemy Name"
 *        }
 *    }
 * 
 * 5. Retrieve Progress in Lobby:
 *    GET /client/quest/progress/:accountId/:questId
 * 
 * 6. Get All Quests:
 *    GET /client/quests/all/:accountId
 * 
 * 7. Get Quest Stats:
 *    GET /client/quest/stats/:accountId
 */

class GameserverIntegration {
    /**
     * Validates gameserver request payload
     * @param {Object} payload - Request body
     * @param {Array<string>} requiredFields - Required field names
     * @returns {Object} - { valid: boolean, error?: string }
     */
    static validatePayload(payload, requiredFields) {
        for (const field of requiredFields) {
            if (!payload[field] && payload[field] !== 0) {
                return {
                    valid: false,
                    error: `Missing required field: ${field}`
                };
            }
        }
        return { valid: true };
    }

    /**
     * Logs gameserver action
     * @param {string} action - Action name
     * @param {string} accountId - Player account ID
     * @param {Object} details - Additional details
     */
    static logAction(action, accountId, details = {}) {
        const timestamp = new Date().toISOString();
        log.debug(`[GAMESERVER] ${action} | AccountId: ${accountId} | ${JSON.stringify(details)} | ${timestamp}`);
    }

    /**
     * Formats quest progress response
     * @param {Object} questProgress - Quest progress object
     * @returns {Object} - Formatted response
     */
    static formatQuestProgressResponse(questProgress) {
        return {
            questId: questProgress.questId,
            questName: questProgress.questName,
            progress: questProgress.objectives.map(obj => ({
                name: obj.objectiveName,
                current: obj.currentProgress,
                required: obj.requiredProgress,
                completed: obj.completed,
                percentage: Math.round((obj.currentProgress / obj.requiredProgress) * 100)
            })),
            completed: questProgress.questCompleted,
            xpRewards: questProgress.xpRewardsEarned,
            accolades: questProgress.accoladesEarned,
            lastUpdated: questProgress.lastUpdated
        };
    }

    /**
     * Get connection status
     * @returns {Object} - Status information
     */
    static getStatus() {
        return {
            service: "Gameserver Integration API",
            status: "operational",
            timestamp: new Date().toISOString(),
            endpoints: {
                questProgress: "POST /gameserver/quest/progress",
                objectiveCompleted: "POST /gameserver/quest/objective-completed",
                questCompleted: "POST /gameserver/quest/completed",
                xpEvent: "POST /gameserver/xp/event",
                clientQuestProgress: "GET /client/quest/progress/:accountId/:questId",
                clientAllQuests: "GET /client/quests/all/:accountId",
                clientQuestStats: "GET /client/quest/stats/:accountId"
            }
        };
    }
}

module.exports = GameserverIntegration;
