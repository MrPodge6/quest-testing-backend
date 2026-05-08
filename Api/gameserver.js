const express = require("express");
const app = express.Router();
const QuestProgress = require("../model/questProgress");
const Profile = require("../model/profiles");
const log = require("../structs/log.js");

// Endpoint for gameserver to report quest progress
app.post("/gameserver/quest/progress", async (req, res) => {
    try {
        const { accountId, questId, questName, objectives, matchId } = req.body;

        if (!accountId || !questId) {
            log.error(`Missing required fields in quest progress: accountId=${accountId}, questId=${questId}`);
            return res.status(400).json({ 
                error: "Missing required fields: accountId, questId" 
            });
        }

        // Find or create quest progress entry
        let questProgress = await QuestProgress.findOne({ 
            accountId: accountId,
            questId: questId 
        });

        if (!questProgress) {
            questProgress = new QuestProgress({
                accountId,
                questId,
                questName,
                objectives: objectives || [],
                matchId
            });
            log.debug(`Created new quest progress entry for ${accountId}: ${questId}`);
        } else {
            // Update existing progress
            if (objectives) questProgress.objectives = objectives;
            questProgress.matchId = matchId;
            questProgress.lastUpdated = new Date();
            log.debug(`Updated quest progress for ${accountId}: ${questId}`);
        }

        await questProgress.save();

        res.json({ 
            success: true, 
            message: "Quest progress recorded",
            questId: questId 
        });
    } catch (err) {
        log.error(`Error updating quest progress: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint for gameserver to report objective completion
app.post("/gameserver/quest/objective-completed", async (req, res) => {
    try {
        const { accountId, questId, objectiveName, currentProgress, requiredProgress } = req.body;

        if (!accountId || !questId || !objectiveName) {
            log.error(`Missing required fields in objective update`);
            return res.status(400).json({ 
                error: "Missing required fields: accountId, questId, objectiveName" 
            });
        }

        const questProgress = await QuestProgress.findOne({ 
            accountId: accountId,
            questId: questId 
        });

        if (!questProgress) {
            log.error(`Quest progress not found for ${accountId}: ${questId}`);
            return res.status(404).json({ error: "Quest progress not found" });
        }

        // Update specific objective
        const objectiveIndex = questProgress.objectives.findIndex(
            obj => obj.objectiveName === objectiveName
        );

        if (objectiveIndex !== -1) {
            questProgress.objectives[objectiveIndex].currentProgress = currentProgress;
            questProgress.objectives[objectiveIndex].requiredProgress = requiredProgress;
            
            if (currentProgress >= requiredProgress) {
                questProgress.objectives[objectiveIndex].completed = true;
                questProgress.objectives[objectiveIndex].completedAt = new Date();
                log.debug(`Objective completed: ${accountId} - ${questId} - ${objectiveName}`);
            }
        }

        questProgress.lastUpdated = new Date();
        await questProgress.save();

        res.json({ 
            success: true, 
            message: "Objective progress recorded",
            objectiveName: objectiveName,
            progress: currentProgress,
            required: requiredProgress
        });
    } catch (err) {
        log.error(`Error updating objective: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint for gameserver to report quest completion
app.post("/gameserver/quest/completed", async (req, res) => {
    try {
        const { accountId, questId, xpRewards, accolades } = req.body;

        if (!accountId || !questId) {
            log.error(`Missing required fields in quest completion`);
            return res.status(400).json({ 
                error: "Missing required fields: accountId, questId" 
            });
        }

        const questProgress = await QuestProgress.findOne({ 
            accountId: accountId,
            questId: questId 
        });

        if (!questProgress) {
            log.error(`Quest progress not found for completion: ${accountId}: ${questId}`);
            return res.status(404).json({ error: "Quest progress not found" });
        }

        questProgress.questCompleted = true;
        questProgress.completedAt = new Date();
        questProgress.xpRewardsEarned = xpRewards || 0;
        
        if (accolades && Array.isArray(accolades)) {
            questProgress.accoladesEarned = accolades.map(acc => ({
                accoladeName: acc.name,
                accoladeId: acc.id,
                xpValue: acc.xpValue || 0,
                earnedAt: new Date()
            }));
        }

        questProgress.lastUpdated = new Date();
        await questProgress.save();

        // Also update user's profile XP
        const profile = await Profile.findOne({ accountId });
        if (profile && profile.profiles.common_core) {
            if (!profile.profiles.common_core.stats.attributes.quest_xp_earned) {
                profile.profiles.common_core.stats.attributes.quest_xp_earned = 0;
            }
            profile.profiles.common_core.stats.attributes.quest_xp_earned += xpRewards || 0;
            profile.profiles.common_core.stats.attributes.lastQuestUpdate = new Date().toISOString();
            await profile.save();
            log.debug(`Updated profile XP for ${accountId}: +${xpRewards} XP`);
        }

        log.debug(`Quest completed: ${accountId} - ${questId} - XP: ${xpRewards}`);

        res.json({ 
            success: true, 
            message: "Quest completion recorded",
            questId: questId,
            xpRewards: xpRewards,
            accolades: accolades || []
        });
    } catch (err) {
        log.error(`Error completing quest: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint for gameserver to report XP event
app.post("/gameserver/xp/event", async (req, res) => {
    try {
        const { accountId, eventType, xpAmount, eventData } = req.body;

        if (!accountId || !eventType || xpAmount === undefined) {
            log.error(`Missing required fields in XP event`);
            return res.status(400).json({ 
                error: "Missing required fields: accountId, eventType, xpAmount" 
            });
        }

        // Update user's profile XP
        const profile = await Profile.findOne({ accountId });
        if (!profile) {
            log.error(`Profile not found for XP event: ${accountId}`);
            return res.status(404).json({ error: "Profile not found" });
        }

        if (!profile.profiles.common_core.stats.attributes.match_xp_earned) {
            profile.profiles.common_core.stats.attributes.match_xp_earned = 0;
        }

        profile.profiles.common_core.stats.attributes.match_xp_earned += xpAmount;
        profile.profiles.common_core.stats.attributes.lastXPEvent = {
            type: eventType,
            xpAmount: xpAmount,
            timestamp: new Date().toISOString(),
            eventData: eventData || {}
        };

        await profile.save();

        log.debug(`XP Event recorded for ${accountId}: ${eventType} - ${xpAmount} XP`);

        res.json({
            success: true,
            message: "XP event recorded",
            accountId: accountId,
            xpAmount: xpAmount,
            totalXP: profile.profiles.common_core.stats.attributes.match_xp_earned
        });
    } catch (err) {
        log.error(`Error processing XP event: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint for client to retrieve quest progress from lobby
app.get("/client/quest/progress/:accountId/:questId", async (req, res) => {
    try {
        const { accountId, questId } = req.params;

        const questProgress = await QuestProgress.findOne({ 
            accountId: accountId,
            questId: questId 
        }).lean();

        if (!questProgress) {
            log.debug(`No quest progress found for ${accountId}: ${questId}`);
            return res.status(404).json({ 
                success: false,
                error: "No quest progress found" 
            });
        }

        res.json({
            success: true,
            questProgress: questProgress
        });
    } catch (err) {
        log.error(`Error fetching quest progress: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint for client to get all quest progress
app.get("/client/quests/all/:accountId", async (req, res) => {
    try {
        const { accountId } = req.params;

        const questProgresses = await QuestProgress.find({ 
            accountId: accountId 
        }).lean();

        res.json({
            success: true,
            totalQuests: questProgresses.length,
            completedQuests: questProgresses.filter(q => q.questCompleted).length,
            quests: questProgresses
        });
    } catch (err) {
        log.error(`Error fetching all quests: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint to get quest progress stats for a user
app.get("/client/quest/stats/:accountId", async (req, res) => {
    try {
        const { accountId } = req.params;

        const questProgresses = await QuestProgress.find({ 
            accountId: accountId 
        }).lean();

        const completedQuests = questProgresses.filter(q => q.questCompleted);
        const totalXpEarned = questProgresses.reduce((sum, q) => sum + (q.xpRewardsEarned || 0), 0);
        const totalAccolades = questProgresses.reduce((sum, q) => sum + (q.accoladesEarned?.length || 0), 0);

        res.json({
            success: true,
            stats: {
                accountId: accountId,
                totalQuests: questProgresses.length,
                completedQuests: completedQuests.length,
                completionRate: questProgresses.length > 0 ? Math.round((completedQuests.length / questProgresses.length) * 100) : 0,
                totalXpEarned: totalXpEarned,
                totalAccolades: totalAccolades,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (err) {
        log.error(`Error fetching quest stats: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// Endpoint to reset quest progress (optional)
app.delete("/gameserver/quest/reset/:accountId/:questId", async (req, res) => {
    try {
        const { accountId, questId } = req.params;

        const result = await QuestProgress.deleteOne({
            accountId: accountId,
            questId: questId
        });

        if (result.deletedCount === 0) {
            log.debug(`No quest progress found to reset: ${accountId}: ${questId}`);
            return res.status(404).json({ error: "Quest progress not found" });
        }

        log.debug(`Quest progress reset for ${accountId}: ${questId}`);

        res.json({
            success: true,
            message: "Quest progress reset"
        });
    } catch (err) {
        log.error(`Error resetting quest progress: ${err.message}`);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

module.exports = app;
