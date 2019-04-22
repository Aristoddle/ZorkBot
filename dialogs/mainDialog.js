// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');


// const WelcomeCard = require('../resources/welcomeCard.json');


const GET_INFO_DIALOG = 'getInfoDialog';
const PICK_GAME_DIALOG = 'pickGameDialog';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const TEXT_PROMPT = 'TextPrompt';
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
        this.prompt = "What should we do\?";

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

        this.addDialog(new TextPrompt(TEXT_PROMPT)).addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
            this.pickGameStep.bind(this),
            this.initUserStep.bind(this)
        ])).addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
            this.firstStepWrapperStep.bind(this),
            this.processCommandStep.bind(this)
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

    async pickGameStep(stepContext) {

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
                this.title = await "zork1";
                break;
        }
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
            return await stepContext.prompt(TEXT_PROMPT, { prompt: "It appears that the bot can't find an email to auto-gen you an account... please enter an email, account name, or some other identifier, and I\'ll use it to store your saves in a consistent location" });
        }
    }

    // setting users and picking games are going to be some of the more
    // dynamic thigns that I do... Hopefully I can make custom cards for 
    // them
    async initUserStep(stepContext) {
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

        let startResponse = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com/start?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile == null ? "AutoSave" : this.lastSaveFile}`)
        .then(response => {
            console.log(response.data); // ex.: { user: 'Your User'}
            console.log(response.status); // ex.: 200
            return response.data;
        });
        
        // by here, a user and game should be initted
        await stepContext.context.sendActivity( startResponse.titleinfo );
        await stepContext.context.sendActivity( startResponse.firstLine );

        await stepContext.context.sendActivity( "Now it's in your hands. ");

        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
    }

    async firstStepWrapperStep(stepContext) {
        return await stepContext.prompt(TEXT_PROMPT, { prompt: this.prompt });
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

        this.prompt = await response.cmdOutput;
        
        if (command.text == "exit program") {
            return await stepContext.endDialog(stepContext);
            
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }
}

module.exports.MainDialog = MainDialog;
