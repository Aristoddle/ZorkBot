// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { CardFactory } = require('botbuilder-core');
const { DialogBot } = require('./dialogBot');
const WelcomeCard = require('./resources/welcomeCard.json');
const { ComponentDialog, ChoicePrompt, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog, ListStyle } = require('botbuilder-dialogs');

class DialogAndWelcomeBot extends DialogBot {
    constructor(conversationState, userState, dialog, logger) {
        super(conversationState, userState, dialog, logger);

        const prompt = new ChoicePrompt('cardPrompt');
        // Set the choice rendering to list and then add it to the bot's DialogSet.
        prompt.style = ListStyle.list;
        this.dialog.dialogs.add(prompt);

        this.onMembersAdded(async context => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity('Welcome to the bot!');
                }
            }
        });
    }
}

module.exports.DialogAndWelcomeBot = DialogAndWelcomeBot;
