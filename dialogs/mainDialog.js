// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const WelcomeCard = require('./../Bots/resources/welcomeCard.json');

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');
const { CardFactory } = require('botbuilder-core');

const SAVE_GAME_DIALOG = "saveDialog"
const GET_INFO_DIALOG = 'getInfoDialog';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const TEXT_PROMPT = 'TextPrompt';
const CONFIRM_PROMPT = 'ConfirmPrompt';

var axios = require('axios');

class MainDialog extends ComponentDialog {
    constructor(logger) {
        super('MainDialog');

        if (!logger) {
            logger = console;
            logger.log('[MainDialog]: logger not passed in, defaulting to console');
        }
        this.lastLine = "";

        this.logger = logger;
        this.gameplayPrompt = "What should we do\?";
        this.enterEmailPrompt = "It appears that the bot can't find an email to auto-gen you an account. Please enter an email, account name, or unique identifier, and I\'ll use it to store your game-saves in a consistent location";

        this.userEmail      = null

        this.newUser        = true;
        this.lastSaveFile   = "AutoSave";
        this.hike           = [];
        this.spell          = [];
        this.wish           = [];
        this.zork1          = [];
        this.zork2          = [];
        this.zork3          = [];

        this.title          = null;
        this.newGameCommand = null;

        this.addDialog(new TextPrompt(TEXT_PROMPT))
        .addDialog(new ConfirmPrompt(CONFIRM_PROMPT))
        .addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
            this.selectGameStep.bind(this),
            this.checkUserEmail.bind(this),
            this.confirmEmailStep.bind(this),
            this.loopEmailConfirmStep.bind(this),
            this.initUserStep.bind(this),
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
        ]))
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

    async selectGameStep(stepContext) {
        
        switch(await stepContext.context.activity.text) {
            case "Launch Zork 1":
                this.title = await "zork1";
                break;
            case "Launch Zork 2":
                this.title = await "zork2";
                break;
            case "Launch Zork 3":
                this.title = await "zork3";
                break;
            case "Launch The Hitchhiker\'s Guide to the Galaxy":
                this.title = await "hike";
                break;
            case "Launch Spellbreaker":
                this.title = await "spellbreak";
                break;
            case "Launch Wishbringer":
                this.title = await "wishbring";
                break;
            default:
                return await stepContext.replaceDialog(GET_INFO_DIALOG,
                    await stepContext.prompt(TEXT_PROMPT, { prompt: "That game wasn't recognized.  Please select a game from the provided list." }));
                break;
        }
        return await stepContext.next([]);
    }


    async checkUserEmail(stepContext) {
        // email was set earlier in the loop
        if (this.userEmail != null) {
            return await stepContext.next(stepContext)
        }

        if (stepContext.message && stepContext.message.entities){
            var userInfo = stepContext.message.entities.find((e) => {
                return e.type === 'UserInfo';
            });

            if (userInfo) {
                var email = userInfo.UserEmail;

                if(email && email !== ''){
                    let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com/user?email=' + email)
                        .then(response => {
                            console.log(response.data);
                            console.log(response.status);
                            return response.data;
                        });

                    //set all user info from the return... 
                    this.userEmail      = await newUserResponse.userEmail;
                    this.newUser        = await newUserResponse.newUser;
                    this.lastSaveFile   = await newUserResponse.lastSaveFile;
                    this.hike           = await newUserResponse.hike;
                    this.spell          = await newUserResponse.spell;
                    this.wish           = await newUserResponse.wish;
                    this.zork1          = await newUserResponse.zork1;
                    this.zork2          = await newUserResponse.zork2;
                    this.zork3          = await newUserResponse.zork3;

                    // say hello to the new person.
                    return await stepContext.next(stepContext);
                }
            }
        } else {
            return await stepContext.prompt(TEXT_PROMPT, { prompt:  this.enterEmailPrompt});
        }
    }

    // setting users and picking games are going to be some of the more
    // dynamic thigns that I do... Hopefully I can make custom cards for 
    // them
    async confirmEmailStep(stepContext) {
        this.userEmail = stepContext.context.activity.text;
        return await stepContext.prompt(CONFIRM_PROMPT, {prompt: `I'm going to set up an account for you at ${this.userEmail}.  Sound good?`});
    }

    async loopEmailConfirmStep(stepContext) {
        if (stepContext.result) { 
            await stepContext.context.sendActivity(`Registering ${this.userEmail}`);
            return await stepContext.next([]);
        } else {
            this.userEmail = null;
            this.enterEmailPrompt = "Please enter your preferred account name/email.";
            return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
        }
    }

    async initUserStep(stepContext) {
        // some other step
        let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com/user?email=' + this.userEmail)
            .then(response => {
                console.log(response.data);
                console.log(response.status);
                return response.data;
            });

        //Once you've gotten email, 
        //set all user info from the return... 
        this.userEmail      = await newUserResponse.userEmail;
        this.lastSaveFile   = await newUserResponse.lastSaveFile;
        this.hike           = await newUserResponse.hike;
        this.spell          = await newUserResponse.spell;
        this.wish           = await newUserResponse.wish;
        this.zork1          = await newUserResponse.zork1;
        this.zork2          = await newUserResponse.zork2;
        this.zork3          = await newUserResponse.zork3;

        switch(this.title) {
            case "zork1":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.zork1);
                break;
            case "zork2":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.zork2);
                break;
            case "zork3":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.zork3);
                break;
            case "hike":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.hike);
                break;
            case "spellbreak":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.spell);
                break;
            case "wishbring":
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.wish);
                break;
            default:
                return await stepContext.replaceDialog(GET_INFO_DIALOG, 
                    await stepContext.prompt(TEXT_PROMPT, { prompt: "Something appears to have gone wrong and I\'ve lost track of which game you wanted to play.  Could you please re-state your intended game?"}));
        }
        const pickSaveCard = CardFactory.adaptiveCard(this.adaptiveCard)
        return await stepContext.prompt(TEXT_PROMPT, { 
            prompt:  await stepContext.context.sendActivity({ 
                attachments: [pickSaveCard] })});
    }

    async startGameStep(stepContext){
        // TODO: add capability to delete the Autosave -->New Game
        let startResponse = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/start?title=${this.title}&email=${this.userEmail}`)
        .then(response => {
            console.log(response.data); // ex.: { user: 'Your User'}
            console.log(response.status); // ex.: 200
            return response.data;
        });
        
        // by here, a user and game should be initted
        await stepContext.context.sendActivity( startResponse.titleinfo );
        await stepContext.context.sendActivity( startResponse.firstLine );

        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
    }

    async firstStepWrapperStep(stepContext) {
        return await stepContext.prompt(TEXT_PROMPT, { prompt: this.gameplayPrompt });
    }

    async processCommandStep(stepContext) {

        let command = {};
        if (process.env.LuisAppId 
            && process.env.LuisAPIKey 
            && process.env.LuisAPIHostName) {
            command = await LuisHelper.executeLuisQuery(this.logger, stepContext.context);
            this.logger.log('LUIS extracted these command details: ', command);
        }

        let response = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/action?title=${this.title}&email=${this.userEmail}}&action=${command.text}`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });

        this.gameplayPrompt = await response.cmdOutput;
        if (command.text == "exit program") {
            return await stepContext.endDialog(stepContext);
            //TODO: pull save intent from LUIS
        } else if ((command.text == "save game") || (command.text == "save")) {
            return await stepContext.replaceDialog(SAVE_GAME_DIALOG, []);
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }

    async confirmSaveStep(stepContext) {
        const saveCheckCard = CardFactory.adaptiveCard(this.adaptiveCard);
        return await stepContext.prompt(TEXT_PROMPT, { 
            prompt: await stepContext.context.sendActivity( { 
                attachments: [saveCheckCard] })}); 
    }

    async promptSaveNameStep(stepContext) {
        // TODO: Set this as a unique call to save manually
        if (stepContext.context.activity.text == "yes") {
            return await stepContext.prompt(TEXT_PROMPT, {
                prompt: "Okay.  What would you like to name your save file?"
            })
        }
        await stepContext.context.sendActivity("New Save creation cancellled.  Continuing game. ")
        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        //do a save --> make it a special call that I just intercept. 
    }

    async sendSaveStep(stepContext) {
        await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/save?title=${this.title}&email=${this.userEmail}&save=${stepContext.context.action.text}`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });
        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
    }

    async buildSaveFilesCard(gameTitle, saveList) {
        let newAdaptiveCard = 
        {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
              {
                "type": "Image",
                "url": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQtB3AwMUeNoq4gUBGe6Ocj8kyh3bXa9ZbV7u1fVKQoyKFHdkqU",
                "size": "stretch"
              },
              {
                "type": "TextBlock",
                "spacing": "medium",
                "size": "default",
                "weight": "bolder",
                "text": `Loading ${gameTitle}`,
                "wrap": true,
                "maxLines": 0
              },
              {
                "type": "TextBlock",
                "size": "default",
                "isSubtle": "yes",
                "text": `${saveList.length == 0? "It looks like this is the first time that you've played this game.  I'm going to set up a profile for you under \"AutoSave\".  If you want to create another save file, just issue a command to do so in-game!  Please select New Game to continue" : "You appear to have at least one save file set up for this account.  Please select the save file that you would like to continue playing.  Be aware that loading anything other than your current AUtoSave will replace that AutoSave with your current state."}`,
                "wrap": true,
                "maxLines": 0
              }
            ],
            "actions": []
        }
        for (var file in saveList) {
            newAdaptiveCard.actions.push({
                "type": "Action.Submit",
                "title": saveList[file],
                "data": `Load game\: ${saveList[file]}`
            });
        }

        newAdaptiveCard.actions.push({
            "type": "Action.Submit",
            "title": "New Game",
            "data": `New Game`
        });

        return newAdaptiveCard; 
    }

    async saveYesNo() {
        let newAdaptiveCard = 
        {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
              {
                "type": "TextBlock",
                "spacing": "medium",
                "size": "default",
                "weight": "bolder",
                "text": `Save: ${this.userEmail}`,
                "wrap": true,
                "maxLines": 0
              },
              {
                "type": "TextBlock",
                "size": "default",
                "isSubtle": "yes",
                "text": "Would you like to create a new save file?  The bot game is auto-saving after each move, but through this dialogue you can crystalize a certain save location to return to it in the future.",
                "wrap": true,
                "maxLines": 0
              }
            ],
            "actions": [
                {"type": "Action.Submit",
                "title": "Yes",
                "data": "Yes"},
                {"type": "Action.Submit",
                "title": "No",
                "data": "No"}
            ]
        }
        return newAdaptiveCard;
    }

    async yesNoCard(username) {
        let newAdaptiveCard = 
        {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
              {
                "type": "TextBlock",
                "spacing": "medium",
                "size": "default",
                "weight": "bolder",
                "text": "Account Confirmation:",
                "wrap": true,
                "maxLines": 0
              },
              {
                "type": "TextBlock",
                "size": "default",
                "isSubtle": "yes",
                "text": `I'm going to set up an account for you at ${uername}.  Is that Okay?`,
                "wrap": true,
                "maxLines": 0
              }
            ],
            "actions": [
                {"type": "Action.Submit",
                "title": "Yes",
                "data": "Yes"},
                {"type": "Action.Submit",
                "title": "No",
                "data": "No"}
            ]
        }
        return newAdaptiveCard;
    }
}

module.exports.MainDialog = MainDialog;
