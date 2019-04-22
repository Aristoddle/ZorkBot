// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');

const { CardFactory } = require('botbuilder-core');
const WelcomeCard = require('./../Bots/resources/welcomeCard.json');


const GET_INFO_DIALOG = 'getInfoDialog';
const CHOOSE_GAME_LOOP = 'chooseGameLoop';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const TEXT_PROMPT = 'TextPrompt';
const CONFIRM_PROMPT = 'ConfirmPrompt';
const ACTION_PROMPT = "What would you like to do?"

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
        this.enterEmailPrompt = "It appears that the bot can't find an email to auto-gen you an account... please enter an email, account name, or some other identifier, and I\'ll use it to store your saves in a consistent location";

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
        .addDialog(new WaterfallDialog(CHOOSE_GAME_LOOP, [
            this.checkIfGoodInputStep.bind(this),
            this.loopIfBadStep.bind(this)
        ]))
        .addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
            this.confirmEmailStep.bind(this),
            this.loopEmailConfirmStep.bind(this),
            this.checkUserEmail.bind(this),
            this.initUserStep.bind(this)
        ]))
        .addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
            this.firstStepWrapperStep.bind(this),
            this.processCommandStep.bind(this)
        ]));

        this.initialDialogId = CHOOSE_GAME_LOOP;
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

    async checkIfGoodInputStep(stepContext) {
        
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
                return await stepContext.prompt(TEXT_PROMPT, { prompt: "That game wasn't recognized.  Please select a game from the provided list." });
                break;
        }
        return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
    }

    async loopIfBadStep(stepContext) { 
        return await stepContext.replaceDialog(CHOOSE_GAME_LOOP, []);
    }


    async checkUserEmail(stepContext) {
        // email was set earlier in the loop
        if (this.userEmail != null) {
            stepContext.next(stepContext)
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
                    stepContext.next(stepContext);
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
        this.userEmail = stepContext.context.text;
        stepContext.prompt.(CONFIRM_PROMPT, {prompt: `I'm going to set up an account for you at ${stepContext.context.text}.  Is that Okay?`});
    }

    async loopEmailConfirmStep(stepContext) {
        if (stepContext.context.text) {= 
            stepContext.context.sendActivity(`Registering ${this.userEmail}`);
            stepContext.next([]);
        } else {
            this.userEmail = null;
            this.enterEmailPrompt = "Please enter your preferred account name/email";
            return await stepContext.replaceDialog(GET_INFO_DIALOG, []);
        }
    }

        // some other step

        let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com/user?email=' + stepContext.context.activity.text)
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
                this.adaptiveCard = await this.buildSaveFilesCard(this.title, this.zork1);
                break;
        }
        const pickSaveCard = CardFactory.adaptiveCard(this.adaptiveCard);
        await stepContext.context.sendActivity({ attachments: [pickSaveCard] });

        let startResponse = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/start?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile == null ? "AutoSave" : this.lastSaveFile}`)
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

        let response = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/action?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile == null ? "AutoSave" : this.lastSaveFile}&action=${command.text}`)
            .then(response => {
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });

        this.gameplayPrompt = await response.cmdOutput;
        
        if (command.text == "exit program") {
            return await stepContext.endDialog(stepContext);
            
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
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
                "text": `${saveList.length == 0? "It looks like this is the first time that you've played this game.  I'm going to set up a profile for you under \"AutoSave\".  If you want to create another save file, just issue a command to do so in-game!" : "You appear to have at least one save file set up for this account.  Please select the save file that you would like to continue playing on"}`,
                "wrap": true,
                "maxLines": 0
              }
            ],
            "actions": []
        }
        for (var file in saveList) {
            newAdaptiveCard.append({
                "type": "Action.Submit",
                "title": saveList[file],
                "data": `Load game\: ${saveList[file]}`
            });
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
