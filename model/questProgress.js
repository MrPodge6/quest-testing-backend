const mongoose = require("mongoose");

const QuestProgressSchema = new mongoose.Schema(
    {
        accountId: { type: String, required: true, index: true },
        questId: { type: String, required: true },
        questName: { type: String, required: true },
        objectives: {
            type: [{
                objectiveName: { type: String, required: true },
                backendName: { type: String, required: true },
                currentProgress: { type: Number, required: true, default: 0 },
                requiredProgress: { type: Number, required: true },
                completed: { type: Boolean, default: false },
                completedAt: { type: Date, default: null }
            }],
            default: []
        },
        questCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null },
        xpRewardsEarned: { type: Number, default: 0 },
        accoladesEarned: [{
            accoladeName: { type: String, required: true },
            accoladeId: { type: String, required: true },
            xpValue: { type: Number, required: true },
            earnedAt: { type: Date, required: true }
        }],
        lastUpdated: { type: Date, default: Date.now },
        matchId: { type: String, default: null }
    },
    {
        collection: "questProgress"
    }
);

const model = mongoose.model('QuestProgressSchema', QuestProgressSchema);

module.exports = model;
