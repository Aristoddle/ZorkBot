// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog, ChoicePrompt} = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');

const { CardFactory } = require('botbuilder-core');
const WelcomeCard = require('./../Bots/resources/welcomeCard.json');


const GET_INFO_DIALOG   = 'getInfoDialog';
const PRE_GAME_LOOP     = 'preGameLoop';
const LOOP_GAME_DIALOG  = 'loopGameDialog';
const TEXT_PROMPT       = 'TextPrompt';
const CONFIRM_PROMPT    = 'ConfirmPrompt';
const CHOICE_PROMPT     = 'ChoicePrompt'
const ACTION_PROMPT     = "What would you like to do?"

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
        .addDialog(new ConfirmPrompt(CONFIRM_PROMPT))
        .addDialog(new ChoicePrompt(CHOICE_PROMPT))
        .addDialog(new WaterfallDialog(PRE_GAME_LOOP, [
            this.chooseGameStep.bind(this),
            this.getUserEmailStep.bind(this),
        ]))
        .addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
            this.confirmEmailStep.bind(this),
            this.loopConfirmEmailStep.bind(this),
            this.initUserStep.bind(this),
        ]))
        .addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
            this.firstStepWrapper.bind(this),
            this.processCommandStep.bind(this)
        ]));

        this.initialDialogId = PRE_GAME_LOOP;
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

    async chooseGameStep(stepContext) {

        return await stepContext.prompt(CHOICE_PROMPT, {
            prompt: "Hi!  Thanks so much for demoing my Senior Project.  Select a game from the list below and we can begin",
            retryPrompt: "You need to select one of the listed games to play.",
            choices: ['Zork One', 'Zork Two', 'The Hitchhiker\'s Guide to the Galaxy', 'Spellbreaker', 'Wishbringer']});
    }

    async getUserEmailStep(stepContext) {

        //get the title they're playing from the previous call
        this.title = stepContext.result;

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
        this.userEmail = stepContext.context.activity.text;
        stepContext.prompt(CONFIRM_PROMPT, {prompt: `I'm going to set up an account for you at ${this.userEmail}.  Is that Okay\?`});
    }

    async loopConfirmEmailStep(stepContext) {
        if (stepContext.result) { 
            stepContext.context.sendActivity(`Registering ${this.userEmail}`);
            stepContext.next(stepContext);
        } else {
            this.userEmail = null;
            this.enterEmailPrompt = "Please enter your preferred account name/email";
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
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Zork.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.zork1 + ["New Game"]
                });
            case "zork2":
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Zork Two: The Wizard of Frobozz.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.zork2 + ["New Game"]
                });
            case "zork3":
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Zork Three: The Dungeon Master.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.zork3 + ["New Game"]
                });
            case "hike":
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to The Hitchiker's Guide to the Galaxy (the spoken text adventure).  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.hike + ["New Game"]
                });
            case "spellbreak":
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Spellbreaker.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.spell + ["New Game"]
                });
            case "wishbring":
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Wishbringer: The Magick Stone of Dreams.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.wish + ["New Game"]
                });
            default:
                return await stepContext.prompt(CHOICE_PROMPT, {
                    prompt: `${zork1.length == 0? 
                        "Welcome to Zork One.  You don't appear to have any saved games on this account, so I'll start you off with a new game.  Please select, type or say \"New Game\" to begin." 
                        : 
                        "Please select the save file that you would like to play"
                    }`,
                    retryPrompt: "You need to select one of the listed save files.  If you start a New Game, your previous AutoSave will be deleted",
                    choices: this.zork1 + ["New Game"]
                });
        }
        
    }

    async startGameStep(stepContext) {
        this.lastSaveFile = stepContext.context.activity.text;
        
        let startResponse = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/start?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile}`)
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

    async firstStepWrapper(stepContext) {
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

        let response = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/action?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile}&action=${command.text}`)
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
}

module.exports.MainDialog = MainDialog;
