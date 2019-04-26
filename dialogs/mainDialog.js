// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// import { } from 'applicationinsights';
// import { } from 'botbuilder';
// import { } from 'botbuilder-dialogs';
// import { } from 'botbuilder-ai';
// import { } from 'dotenv';

const { ComponentDialog, DialogSet, DialogTurnStatus, ChoicePrompt, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { ZorkActionLuis } = require('./zorkActionLuis');
const { PickGameLuis } = require('./pickGameLuis');
const { CardFactory } = require('botbuilder-core');

const WelcomeCard = require('./../Bots/resources/welcomeCard.json');

const CHOICE_PROMPT = 'choicePrompt';
const SAVE_GAME_DIALOG = 'saveDialog';
const GET_INFO_DIALOG = 'getInfoDialog';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const LOAD_SAVE_DIALOG = 'loadSaveDialog';
const FIRST_LINE_DIALOG = 'firstLineDialog';
const TEXT_PROMPT = 'TextPrompt';
const CONFIRM_PROMPT = 'ConfirmPrompt';

// const DEBUG = false;
// const APIROOT = 'http://zorkhub.eastus.cloudapp.azure.com:443';
const APIROOT = 'http://zorkhub.eastus.cloudapp.azure.com';
var axios = require('axios');

const LUIS_ACTIONS = false;

class MainDialog extends ComponentDialog {
    constructor(logger) {
        super('MainDialog');

        if (!logger) {
            logger = console;
            logger.log('[MainDialog]: logger not passed in, defaulting to console');
        }
        this.lastLine = '';

        this.logger = logger;
        this.gameplayPrompt = 'What should we do?';
        this.enterEmailPrompt = "It appears the bot wasn't able to extract your email address from the current context. Please supply a unique identifier that Zork Bot can use to manage your saves and gameplay history.";

        this.email = null;
        this.userExists = false;
        this.gameID = null;
        this.title = null;

        this.hike = [];
        this.spell = [];
        this.wish = [];
        this.zork1 = [];
        this.zork2 = [];
        this.zork3 = [];

        this.lastGame = 'AutoSave';
        this.gameSaves = [];
        this.systemProvidedEmail = false;
        this.makingNewAccount = false;

        this.addDialog(new TextPrompt(TEXT_PROMPT))
            .addDialog(new ConfirmPrompt(CONFIRM_PROMPT))
            .addDialog(new ChoicePrompt(CHOICE_PROMPT))
            .addDialog(new WaterfallDialog(FIRST_LINE_DIALOG, [
                this.sendIntroLine.bind(this)
            ]))
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
        this.initialDialogId = FIRST_LINE_DIALOG;
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
    async sendIntroLine(stepContext) {
        const welcomeCard = CardFactory.adaptiveCard(WelcomeCard);
        await stepContext.context.sendActivity({
            attachments: [welcomeCard],
            speak: "Thanks for using the Zork Bot. \nI built this application to create a modern interface for classic Interactive Fiction games like Zork, Wishbringer, and The Hitchhiker's Guide to the Galaxy.  Before we begin, we'll need to set up an account to store your save files and select the game that you would like to play. \nWhen you decide to stop playing, say 'Stop ZorkBot', and I will end the session. You can also say 'ZorkBot Repeat' to have the ZorkBot re-read the game output to you.",
            inputHint: 'ignoringInput'
        });
        return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
    }

    async checkUserEmail(stepContext) {
        // email was set earlier in the loop
        if (this.email != null) {
            return await stepContext.next(stepContext);
        }

        if (stepContext.context.activity && stepContext.context.activity.entities) {
            var userInfo = await stepContext.context.activity.entities.find((e) => {
                return e.type === 'UserInfo';
            });
            // TODO: here's wehre the user info is -- check if you're on mobile and stuff...
            // something needs to be done to control that on-mobile call stack
            if (userInfo) {
                var foundEmail = await userInfo.email;
                if (foundEmail && foundEmail !== '') {
                    this.email = await foundEmail;
                    this.systemProvidedEmail = true;
                    return await stepContext.next(stepContext);
                }
            } else {
                await stepContext.context.sendActivity({
                    text: this.enterEmailPrompt,
                    speak: this.enterEmailPrompt,
                    inputHint: 'ignoringInput'
                });
                return await stepContext.prompt(TEXT_PROMPT, {
                    prompt: 'this.enterEmailPrompt' });
            }
        }
        await stepContext.context.sendActivity({
            text: this.enterEmailPrompt,
            speak: this.enterEmailPrompt,
            inputHint: 'ignoringInput'
        });
        return await stepContext.prompt(TEXT_PROMPT, {
            prompt: this.enterEmailPrompt });
    }

    async confirmEmailStep(stepContext) {
        if (this.email == null) {
            this.email = await stepContext.result;
        }
        let newUserResponse = await axios.get(`${ APIROOT }/user?email=${ this.email }`)
            .then(response => {
                console.log(response.data);
                console.log(response.status);
                return response.data;
            });

        this.newUser = await newUserResponse.newUser;
        this.lastGame = await newUserResponse.profile.lastGame;
        this.hike = await newUserResponse.profile.hike;
        this.wish = await newUserResponse.profile.wish;
        this.spell = await newUserResponse.profile.spell;
        this.zork1 = await newUserResponse.profile.zork1;
        this.zork2 = await newUserResponse.profile.zork2;
        this.zork3 = await newUserResponse.profile.zork3;

        if (this.newUser) {
            await stepContext.context.sendActivity({
                text: `There was no ZorkBot account found at ${ this.email }. Should I create one there?`,
                speak: `There was no Zork Bot account found at ${ this.email }. Should I create one there?`,
                inputHint: 'ignoringInput'
            });
            return await stepContext.prompt(CONFIRM_PROMPT, {
                prompt: `There was no Zork Bot account found at ${ this.email }. Should I create one there?`
            });
        } else {
            if (this.systemProvidedEmail) {
                await stepContext.context.sendActivity({
                    text: `I was able to pull your email from the application settings, and it appears that an account has already been created for ${ this.email }.  Logging in...`,
                    speak: `I was able to pull your email from the application settings, and it appears that an account has already been created for ${ this.email }.  Logging in...`,
                    inputHint: 'ignoringInput'
                });
                return await stepContext.next(stepContext);
            } else {
                await stepContext.context.sendActivity({
                    text: `An account was found at ${ this.email }. Is this you?  Reply "No" to pick a different account`,
                    speak: `An account was found at ${ this.email }. Is this you?  Reply "No" to pick a different account`,
                    inputHint: 'ignoringInput'
                });
                return await stepContext.prompt(CONFIRM_PROMPT, {
                    prompt: `An account was found at ${ this.email }. Is this you?  Reply "No" to pick a different account`
                });
            }
        }
    }

    async loopEmailConfirmStep(stepContext) {
        if (stepContext.result) {
            if (this.makingNewAccount) {
                await stepContext.context.sendActivity({
                    text: `Registered ${ this.email }.`,
                    speak: `Registered ${ this.email }.`,
                    inputHint: 'ignoringInput'
                });
            }
            return await stepContext.next(stepContext);
        } else {
            this.email = null;
            this.enterEmailPrompt = 'Okay. Please enter a new account name.';
            return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
        }
    }

    async tryLoadLastGameStep(stepContext) {
        let lastGame = null;
        if (this.lastGame) {
            switch (this.lastGame) {
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
            await stepContext.context.sendActivity({
                text: `Your last saved game was for the game ${ lastGame }.  Would you like to continue playing ${ lastGame }?`,
                speak: `Your last saved game was for the game ${ lastGame }.  Would you like to continue playing ${ lastGame }?`,
                inputHint: 'ignoringInput'
            });

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
            return await stepContext.next(await stepContext.sendActivity({
                text: 'No recent saves found.',
                speak: 'No recent saves found.',
                inputHint: 'ignoringInput'
            }));
        }
    }

    async zorkOrNoStep(stepContext) {
        await stepContext.context.sendActivity({
            text: 'Would you like to play a Zork title, or another work of Interactive Fiction?',
            speak: 'Would you like to play a Zork title, or another work of Interactive Fiction?',
            inputHint: 'ignoringInput'
        });
        return await stepContext.prompt(CHOICE_PROMPT, {
            style: 'auto',
            prompt: 'Would you like to play a Zork title, or another work of Interactive Fiction?',
            speak: 'Would you like to play a Zork title, or another work of Interactive Fiction?',
            retryPrompt: 'Please say Zork, or Another Work.',
            retrySpeak: 'Please say Zork, or Another Work.',
            choices: ['Zork', 'Another Work.']
        });
    }

    async selectGameStep(stepContext) {
        if (stepContext.result.value == 'Zork') {
            await stepContext.context.sendActivity({
                text: 'Alright! Among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
                speak: 'Alright! so, among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
                inputHint: 'ignoringInput'
            });
            return await stepContext.prompt(CHOICE_PROMPT, {
                style: 'auto',
                prompt: 'Alright! Among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
                speak: 'Alright! so, among the Zork Titles, would you like to play Zork One, Zork Two, or Zork Three?',
                retryPrompt: 'Please indicate the Zork title you would like to play.',
                retrySpeak: 'Please say Zork One, Zork Two, or Zork Three',
                choices: ['Zork One', 'Zork Two', 'Zork Three']
            });
        } else {
            await stepContext.context.sendActivity({
                text: 'Alright!  The other games that we have to play are The Hitchhiker\'s Guide To The Galaxy, Spellbreaker, and Wishbringer.  Which one would you like to play?',
                speak: 'Alright!  The other games that we have to play are The Hitchhiker\'s Guide To The Galaxy, Spellbreaker, and Wishbringer.  Which one would you like to play?',
                inputHint: 'ignoringInput'
            });
            return await stepContext.prompt(CHOICE_PROMPT, {
                style: 'auto',
                prompt: 'Cool!  The other games that we have to play are The Hitchhiker\'s Guide To The Galaxy, Spellbreaker, and Wishbringer.  Which one would you like to play?',
                speak: 'Cool!  The other games that we have to play are The Hitchhiker\'s Guide To The Galaxy, Spellbreaker, and Wishbringer.  Which one would you like to play?',
                retryPrompt: 'You need to choose one of the listed games to play.',
                retrySpeak: 'Please Say, Hitchhiker\'s Guide, Spellbreaker, or Wishbringer',
                choices: ['Hitchhiker\'s Guide', 'Spellbreaker', 'Wishbringer']
            });
        }
    }

    async setTitleStep(stepContext) {
        try {
            if (process.env.GameChoiceLuisAppID &&
                process.env.GameChoiceLuisAPIKey &&
                process.env.GameChoiceLuisAPIHostName) {
                let game = await PickGameLuis.executeLuisQuery(this.logger, stepContext.context);
                this.gameID = await game.intent;
            }
        } catch (err) {
            console.log('err');
        }

        switch (this.gameID) {
        case 'zork1':
            this.title = 'Zork One';
            this.gameSaves = this.zork1;
            break;
        case 'zork2':
            this.title = 'Zork Two';
            this.gameSaves = this.zork2;
            break;
        case 'zork3':
            this.title = 'Zork Three';
            this.gameSaves = this.zork3;
            break;
        case 'hike':
            this.title = 'The Hitchhiker\'s Guide To The Galaxy';
            this.gameSaves = this.hike;
            break;
        case 'spell':
            this.title = 'Spellbreaker';
            this.gameSaves = this.spell;
            break;
        case 'wish':
            this.title = 'Wishbringer';
            this.gameSaves = this.wish;
            break;
        }
        return await stepContext.replaceDialog(LOAD_SAVE_DIALOG, []);
    }

    async loadSavesStep(stepContext) {
        this.gameSaves.push('New Game');
        let promptObj = {};
        if (this.gameSaves.length == 0) {
            await stepContext.context.sendActivity({
                text: `This is your first playthrough of ${ this.title }, so please select New Game, and let's get started.`,
                speak: `This is your first playthrough of ${ this.title }, so please select New Game, and let's get started.`,
                inputHint: 'ignoringInput'
            });
            promptObj = {
                // style: 'auto',
                style: 'auto',
                prompt: `This is your first playthrough of ${ this.title }, so please select New Game, and let's get started.`,
                retryPrompt: 'You need to select one of the listed games to play.',
                retrySpeak: 'You need to select one of the listed games to play.',
                choices: this.gameSaves
            };
        } else {
            await stepContext.context.sendActivity({
                text: `Loading ${ this.title }. \nWhich save file would you like to load?  Selecting New Game will delete any AutoSaves that you might have present.`,
                speak: `Which save file would you like to load?  Selecting New Game will delete any AutoSaves that you might have present.`,
                inputHint: 'ignoringInput'
            });
            promptObj = {
                // style: 'auto',
                style: 'auto',
                prompt: 'Which save file would you like to load?  Selecting New Game will delete any AutoSaves that you might have present.',
                speak: 'Which save file would you like to load?  Selecting New Game will delete any AutoSaves that you might have present.',
                retryPrompt: 'You need to select one of the listed games to play.',
                retrySpeak: 'You need to select one of the listed games to play.',
                choices: this.gameSaves
            };
        }
        return await stepContext.prompt(CHOICE_PROMPT, promptObj);
        // return await stepContext.prompt(TEXT_PROMPT, "test prompt");
    }

    async startGameStep(stepContext) {
        let save = await stepContext.result.value;
        let userObject = {};

        if (save == 'New Game') {
            userObject = await axios.get(`${ APIROOT }/newGame?title=${ this.gameID }&email=${ this.email }`)
                .then(response => {
                    console.log(response.data); // ex.: { user: 'Your User'}
                    console.log(response.status); // ex.: 200
                    return response.data;
                });
        } else {
            userObject = await axios.get(`${ APIROOT }/start?title=${ this.gameID }&email=${ this.email }&save=${ save }`)
                .then(response => {
                    console.log(response.data); // ex.: { user: 'Your User'}
                    console.log(response.status); // ex.: 200
                    return response.data;
                });
        }
        await stepContext.context.sendActivity({
            text: userObject.titleInfo,
            speak: userObject.titleInfo,
            inputHint: 'ignoringInput'
        });
        await stepContext.context.sendActivity({
            text: userObject.firstLine,
            speak: userObject.firstLine,
            inputHint: 'ignoringInput'
        });
        this.gameplayPrompt = 'What would you like to do?';
        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
    }

    async firstStepWrapperStep(stepContext) {
        await stepContext.context.sendActivity({
            text: this.gameplayPrompt,
            speak: this.gameplayPrompt,
            inputHint: 'ignoringInput'
        });
        return await stepContext.prompt(TEXT_PROMPT, {
            prompt: this.gameplayPrompt });
    }

    async processCommandStep(stepContext) {
        let constructedString = '';
        let command = {};
        if (process.env.LuisAppId &&
            process.env.LuisAPIKey &&
            process.env.LuisAPIHostName) {
            command = await ZorkActionLuis.executeLuisQuery(this.logger, stepContext.context);
            this.logger.log('LUIS extracted these command details: ', command);
        }

        if (((/zorkbot repeat/i).test(command.text)) || ((/save/i).test(command.text))) {
            await stepContext.context.sendActivity({
                text: this.gameplayPrompt,
                speak: this.gameplayPrompt,
                inputHint: 'expectingInput'
            });
            return await stepContext.replaceDialog(SAVE_GAME_DIALOG, []);
        }

        // here, we're just blind calling the thing... let's learn more about LUIS entities
        if (LUIS_ACTIONS) {
            constructedString = await this.createResponse(command);
        } else {
            constructedString = command.text;
        }

        let response = await axios.get(`${ APIROOT }/action?title=${ this.gameID }&email=${ this.email }&action=${ constructedString }`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });

        this.gameplayPrompt = await response.cmdOutput;
        if ((/stop ZorkBot/i).test(command.text)) {
            await stepContext.context.sendActivity({
                text: `Thanks for playing.  You can return to this game by navigating back to ${ this.title }, and selecting AutoSave.`,
                speak: `Thanks for playing.  You can return to this game by navigating back to ${ this.title }, and selecting AutoSave.`,
                inputHint: 'ignoringInput'
            });
            return await stepContext.endDialog(stepContext);
        // TODO: pull save intent from LUIS
        } else if (((/save game/i).test(command.text)) || ((/save/i).test(command.text))) {
            return await stepContext.replaceDialog(SAVE_GAME_DIALOG, []);
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async createResponse(louisCommand) {
        return louisCommand;
    }

    async confirmSaveStep(stepContext) {
        await stepContext.context.sendActivity({
            text: 'Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.',
            speak: 'Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.',
            inputHint: 'ignoringInput'
        });
        return await stepContext.prompt(CONFIRM_PROMPT, {
            prompt: 'Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.'
        });
    }

    async promptSaveNameStep(stepContext) {
        // TODO: Set this as a unique call to save manually
        if (stepContext.result) {
            await stepContext.context.sendActivity({
                text: 'What would you like to name your save file?',
                speak: 'What would you like to name your save file?',
                inputHint: 'expectingInput'
            });
            return await stepContext.prompt(TEXT_PROMPT, {
                prompt: 'What would you like to name your save file?'
            });
        } else {
            this.gameplayPrompt = 'New Save Creation Cancelled.  Continuing game.   What would you like to do?';
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async sendSaveStep(stepContext) {
        await axios.get(`${ APIROOT }/save?title=${ this.gameID }&email=${ this.email }&save=${ stepContext.result }`)
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
