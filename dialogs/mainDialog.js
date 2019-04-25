// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// import { } from 'applicationinsights';
// import { } from 'botbuilder';
// import { } from 'botbuilder-dialogs';
// import { } from 'botbuilder-ai';
// import { } from 'dotenv';

const { ComponentDialog, DialogSet, DialogTurnStatus, ChoicePrompt, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');
const { CardFactory } = require('botbuilder-core');

const WelcomeCard = require('./../Bots/resources/welcomeCard.json');

const CHOICE_PROMPT = 'choicePrompt';
const SAVE_GAME_DIALOG = 'saveDialog';
const GET_INFO_DIALOG = 'getInfoDialog';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const LOAD_SAVE_DIALOG = 'loadSaveDialog';
const TEXT_PROMPT = 'TextPrompt';
const CONFIRM_PROMPT = 'ConfirmPrompt';

// const DEBUG = false;
// const APIROOT = 'http://zorkhub.eastus.cloudapp.azure.com:443';
const APIROOT = 'http://zorkhub.eastus.cloudapp.azure.com';

var axios = require('axios');

class MainDialog extends ComponentDialog {
    constructor(logger) {
        super('MainDialog');

        if (!logger) {
            logger = console;
            logger.log('[MainDialog]: logger not passed in, defaulting to console');
        }
        this.lastLine = '';

        this.logger = logger;
        this.gameplayPrompt = 'What should we do\?';
        this.enterEmailPrompt = "Before we get started, It appears that the bot wasn't able to extract your email address from the current context. Please enter a unique identifier that you would like to use to store saved games and other information affiliated with your account.";

        this.email = null;
        this.userExists = false;
        this.lastSaveFile = 'AutoSave';
        this.title = null;

        this.hike = [];
        this.spell = [];
        this.wish = [];
        this.zork1 = [];
        this.zork2 = [];
        this.zork3 = [];

        this.gameSaves = [];

        this.addDialog(new TextPrompt(TEXT_PROMPT))
            .addDialog(new ConfirmPrompt(CONFIRM_PROMPT))
            .addDialog(new ChoicePrompt(CHOICE_PROMPT))
            .addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
                this.checkUserEmail.bind(this),
                this.confirmEmailStep.bind(this),
                this.loopEmailConfirmStep.bind(this),
                this.zorkOrNoStep.bind(this),
                this.selectGameStep.bind(this),
                this.setTitleStep.bind(this)
            ]))
            .addDialog(new WaterfallDialog(LOAD_SAVE_DIALOG, [
                this.loadSavesStep.bind(this),
                this.startGameStep.bind(this)
            ]))
            .addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
                this.firstStepWrapperStep.bind(this),
                this.processCommandStep.bind(this)
            ]))
            .addDialog(new WaterfallDialog(SAVE_GAME_DIALOG, [
                this.confirmSaveStep.bind(this),
                this.promptSaveNameStep.bind(this),
                this.sendSaveStep.bind(this)
            ]));
        this.initialDialogId = GET_INFO_DIALOG;
    }

    /**
     * The run method handles the incoming activity (in the form of a DialogContext) and passes it through the dialog system.
     * If no dialog is active, it will start the default dialog.
     * @param {*} dialogContext
     */
    async run(context, accessor) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);

        const dialogContext = await dialogSet.createContext(context);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id);
        }
    }

    async checkUserEmail(stepContext) {
        const welcomeCard = CardFactory.adaptiveCard(WelcomeCard);
        await stepContext.context.sendActivity({ attachments: [welcomeCard] });
        // email was set earlier in the loop
        if (this.email != null) {
            return await stepContext.next(stepContext);
        }

        if (stepContext.message && stepContext.message.entities) {
            var userInfo = stepContext.message.entities.find((e) => {
                return e.type === 'UserInfo';
            });

            if (userInfo) {
                await stepContext.context.sendActivity(`UserInfo Found: ${ userInfo }`);
                var foundEmail = userInfo.email;
                if (foundEmail && foundEmail !== '') {
                    await stepContext.context.sendActivity(`Email found: ${ foundEmail }`);

                    this.email = foundEmail;
                    return await stepContext.next(stepContext);
                }
            }
        } else {
            return await stepContext.prompt(TEXT_PROMPT, {
                prompt: this.enterEmailPrompt });
        }
    }

    // setting users and picking games are going to be some of the more
    // dynamic thigns that I do... Hopefully I can make custom cards for
    // them
    async confirmEmailStep(stepContext) {
        if (this.email == null) {
            this.email = stepContext.result;
        }
        let newUserResponse = await axios.get(`${ APIROOT }/user?email=${ this.email }`)
            .then(response => {
                console.log(response.data);
                console.log(response.status);
                return response.data;
            });
        this.newUser = newUserResponse.newUser;
        this.email = newUserResponse.profile.email;
        this.hike = newUserResponse.profile.hike;
        this.wish = newUserResponse.profile.wish;
        this.spell = newUserResponse.profile.spell;
        this.zork1 = newUserResponse.profile.zork1;
        this.zork2 = newUserResponse.profile.zork2;
        this.zork3 = newUserResponse.profile.zork3;

        if (this.newUser) {
            return await stepContext.prompt(CONFIRM_PROMPT, {
                prompt: `There was no ZorkBot account found at ${ this.email }. Should I create one there?`
            });
        } else {
            return await stepContext.prompt(CONFIRM_PROMPT, {
                prompt: `An account was found at ${ this.email }. Is this you?  If not, you will be prompted to provide an alternate account name`
            });
        }
    }

    async loopEmailConfirmStep(stepContext) {
        if (stepContext.result) {
            await stepContext.context.sendActivity(`Registered ${ this.email }.`);
            return await stepContext.next(stepContext);
        } else {
            this.email = null;
            this.enterEmailPrompt = 'Please enter an alternate account name.';
            return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
        }
    }

    async tryLoadLastGameStep(stepContext) {
        let lastGame = null;
        if (this.lastSaveFile) {
            switch (this.lastSaveFile) {
            case 'zork1':
                lastGame = 'Zork One';
                break;
            case 'zork2':
                lastGame = 'Zork Two';
                break;
            case 'zork3':
                lastGame = 'Zork Three';
                break;
            case 'hike':
                lastGame = 'The Hitchiker\'s Guide To The Galaxy';
                break;
            case 'spell':
                lastGame = 'Spellbreaker';
                break;
            case 'wish':
                lastGame = 'Wishbringer';
                break;
            }
        }
        if (lastGame != null) {
            return await stepContext.prompt(CONFIRM_PROMPT, {
                prompt: `Your last saved game was for the game ${ lastGame }.  Would you like to continue playing ${ lastGame }?`
            });
        } else {
            return await stepContext.next(stepContext);
        }
    }

    async loadLastOrNoStep(stepContext) {
        if (stepContext.result) {
            stepContext.replaceDialog(LOAD_SAVE_DIALOG, []);
        } else {
            return await stepContext.next(await stepContext.sendActivity('No recent saves found.'));
        }
    }

    async zorkOrNoStep(stepContext) {
        return await stepContext.prompt(CHOICE_PROMPT, {
            style: 'suggestedAction',
            prompt: 'Would you like to play a Zork title, or another work of Interactive Fiction?',
            retryPrompt: 'Please say Zork, or Other I.F.',
            choices: ['Zork', 'Other I.F.']
        });
    }

    async selectGameStep(stepContext) {
        let zorkprompt = {
            style: 'suggestedAction',
            prompt: 'Alright! so, among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
            retryPrompt: 'Please indicate the Zork title you would like to play.',
            choices: ['Zork One', 'Zork Two', 'Zork Three']
        }
        if (stepContext.result.value == 'Zork') {
            return await stepContext.prompt(CHOICE_PROMPT, {
                style: 'suggestedAction',
                prompt: 'Alright! so, among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
                retryPrompt: 'Please indicate the Zork title you would like to play.',
                choices: ['Zork One', 'Zork Two', 'Zork Three']
            });
        } else {
            return await stepContext.prompt(CHOICE_PROMPT, {
                style: 'suggestedAction',
                prompt: 'Alright!  The other games that we have to play are The Hitchhiker\'s Guide To The Galaxy, Spellbreaker, and Wishbringer.  Which one would you like to play?',
                retryPrompt: 'You need to choose one of the listed games to play.',
                choices: ['Hitchhiker\'s Guide', 'Spellbreaker', 'Wishbringer']
            });
        }
    }

    async setTitleStep(stepContext) {
        switch(stepContext.result.value){
        case 'Zork One':
            this.title = 'zork1';
            this.gameSaves = this.zork1;
            break;
        case 'Zork Two':
            this.title = 'zork2';
            this.gameSaves = this.zork2;
            break;
        case 'Zork Three':
            this.title = 'zork3';
            this.gameSaves = this.zork3;
            break;
        case 'Hitchhiker\'s Guide':
            this.title = 'hike';
            this.gameSaves = this.hike;
            break;
        case 'Spellbreaker':
            this.title = 'zork1';
            this.gameSaves = this.spell;
            break;
        case 'Wishbringer':
            this.title = 'wish';
            this.gameSaves =  this.wish;
            break;
        }
        return await stepContext.replaceDialog(LOAD_SAVE_DIALOG, []);         
    }

    async getSavesForAccount(title) {
        switch (title) {
        case 'Zork One':
            return this.zork1;
        case 'Zork Two':
            return this.zork2;
        case 'Zork Three':
            return this.zork3;
        case 'Hitchhiker\'s Guide':
            return this.hike;
        case 'Spellbreaker':
            return this.spell;
        case 'Wishbringer':
            return this.wish;
        }
    }

    async loadSavesStep(stepContext) {
        this.gameSaves.push('New Game');
        let promptObj = {
            // style: 'heroCard',
            style: 'suggestedAction',
            prompt: 'Which save file would you like to load?  Selecting New Game will delete any AutoSaves that you might have present',
            retryPrompt: 'You need to select one of the listed games to play.',
            choices: this.gameSaves
        };
        return await stepContext.prompt(CHOICE_PROMPT, promptObj);
        //return await stepContext.prompt(TEXT_PROMPT, "test prompt");
    }

    async startGameStep(stepContext) {
        let save = stepContext.result.value;
        let userObject = {};

        if (save == 'New Game') {
            userObject = await axios.get(`${ APIROOT }/newGame?title=${ this.title }&email=${ this.email }`)
                .then(response => {
                    console.log(response.data); // ex.: { user: 'Your User'}
                    console.log(response.status); // ex.: 200
                    return response.data;
                });
            await stepContext.context.sendActivity(userObject.titleInfo);
            await stepContext.context.sendActivity(userObject.firstLine);
            this.gameplayPrompt = 'What would you like to do?';
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        } else {
            userObject = await axios.get(`${ APIROOT }/start?title=${ this.title }&email=${ this.email }&save=${ save }`)
                .then(response => {
                    console.log(response.data); // ex.: { user: 'Your User'}
                    console.log(response.status); // ex.: 200
                    return response.data;
                });
            await stepContext.context.sendActivity(userObject.titleInfo);
            await stepContext.context.sendActivity(userObject.firstLine);
            this.gameplayPrompt = 'What would you like to do?';
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async firstStepWrapperStep(stepContext) {
        return await stepContext.prompt(TEXT_PROMPT, {
            prompt: this.gameplayPrompt });
    }

    async processCommandStep(stepContext) {
        let command = {};
        if (process.env.LuisAppId &&
            process.env.LuisAPIKey &&
            process.env.LuisAPIHostName) {
            command = await LuisHelper.executeLuisQuery(this.logger, stepContext.context);
            this.logger.log('LUIS extracted these command details: ', command);
        }

        let response = await axios.get(`${ APIROOT }/action?title=${ this.title }&email=${ this.email }&action=${ command.text }`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });

        this.gameplayPrompt = await response.cmdOutput;
        if ((/stop zorkbot/i).test(command.text)) {
            await stepContext.context.sendActivity(`Thanks for playing.  You can return to this game by navigating back to ${ this.title }, and selecting AutoSave,`);
            return await stepContext.endDialog(stepContext);
        // TODO: pull save intent from LUIS
        } else if (((/save game/i).test(command.text)) || ((/save/i).test(command.text))) {
            return await stepContext.replaceDialog(SAVE_GAME_DIALOG, []);
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async confirmSaveStep(stepContext) {
        return await stepContext.prompt(CONFIRM_PROMPT, {
            prompt: 'Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.'
        });
    }

    async promptSaveNameStep(stepContext) {
        // TODO: Set this as a unique call to save manually
        if (stepContext.result) {
            return await stepContext.prompt(TEXT_PROMPT, {
                prompt: 'What would you like to name your save file?'
            });
        } else {
            this.gameplayPrompt = 'New Save Creation Cancelled.  Continuing game.   What would you like to do?';
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async sendSaveStep(stepContext) {
        await axios.get(`${ APIROOT }/save?title=${ this.title }&email=${ this.email }&save=${ stepContext.result }`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });
        this.gameplayPrompt = `New Save created at ${ stepContext.result }.  What would you like to do now?`;
        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
    }

    async buildSaveFilesCard(gameTitle, saveList) {
        let newAdaptiveCard =
        {
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type': 'AdaptiveCard',
            'version': '1.0',
            'body': [
                {
                    'type': 'Image',
                    'url': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQtB3AwMUeNoq4gUBGe6Ocj8kyh3bXa9ZbV7u1fVKQoyKFHdkqU',
                    'size': 'stretch'
                },
                {
                    'type': 'TextBlock',
                    'spacing': 'medium',
                    'size': 'default',
                    'weight': 'bolder',
                    'text': `Loading ${ gameTitle }`,
                    'wrap': true,
                    'maxLines': 0
                },
                {
                    'type': 'TextBlock',
                    'size': 'default',
                    'text': `${ saveList.length == 0 ? "It looks like this is the first time that you've played this game.  I'm going to set up a profile for you under \"AutoSave\".  If you want to create another save file, just issue a command to do so in-game!  Please select New Game to continue" : 'You appear to have at least one save file set up for this account.  Please select the save file that you would like to continue playing.  Be aware that loading anything other than your current AUtoSave will replace that AutoSave with your current state.' }`,
                    'wrap': true,
                    'maxLines': 0
                }
            ],
            'actions': []
        };
        for (var file in saveList) {
            newAdaptiveCard.actions.push({
                'type': 'Action.Submit',
                'title': saveList[file],
                'data': `Load game\: ${ saveList[file] }`
            });
        }

        newAdaptiveCard.actions.push({
            'type': 'Action.Submit',
            'title': 'New Game',
            'data': `New Game`
        });

        return newAdaptiveCard;
    }

    async saveYesNo() {
        let newAdaptiveCard =
        {
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type': 'AdaptiveCard',
            'version': '1.0',
            'body': [
                {
                    'type': 'TextBlock',
                    'spacing': 'medium',
                    'size': 'default',
                    'weight': 'bolder',
                    'text': `Save: ${ this.email }`,
                    'wrap': true,
                    'maxLines': 0
                },
                {
                    'type': 'TextBlock',
                    'size': 'default',
                    'text': 'Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.',
                    'wrap': true,
                    'maxLines': 0
                }
            ],
            'actions': [
                { 'type': 'Action.Submit',
                    'title': 'Yes',
                    'data': 'Yes' },
                { 'type': 'Action.Submit',
                    'title': 'No',
                    'data': 'No' }
            ]
        };
        return newAdaptiveCard;
    }

    async yesNoCard(username) {
        let newAdaptiveCard =
        {
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
            'type': 'AdaptiveCard',
            'version': '1.0',
            'body': [
                {
                    'type': 'TextBlock',
                    'spacing': 'medium',
                    'size': 'default',
                    'weight': 'bolder',
                    'text': 'Account Confirmation:',
                    'wrap': true,
                    'maxLines': 0
                },
                {
                    'type': 'TextBlock',
                    'size': 'default',
                    'text': `I'm going to set up an account for you at ${ username }.  Is that Okay?`,
                    'wrap': true,
                    'maxLines': 0
                }
            ],
            'actions': [
                { 'type': 'Action.Submit',
                    'title': 'Yes',
                    'data': 'Yes' },
                { 'type': 'Action.Submit',
                    'title': 'No',
                    'data': 'No' }
            ]
        };
        return newAdaptiveCard;
    }
}

module.exports.MainDialog = MainDialog;
