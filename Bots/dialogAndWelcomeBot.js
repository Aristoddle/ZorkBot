// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// const { CardFactory } = require('botbuilder-core');
const { DialogBot } = require('./dialogBot');
// const WelcomeCard = require('./resources/welcomeCard.json');

class DialogAndWelcomeBot extends DialogBot {
    constructor(conversationState, userState, dialog, logger) {
        super(conversationState, userState, dialog, logger);

        this.onMembersAdded(async context => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; cnt++) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    // Run the Dialog with the new message Activity.
                    await this.dialog.run(context, this.dialogState);
                    await this.conversationState.saveChanges(context, false);
                    await this.userState.saveChanges(context, false);
                }
            }
        });
    }
}

module.exports.DialogAndWelcomeBot = DialogAndWelcomeBot;
