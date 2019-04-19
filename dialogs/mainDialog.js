// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');


const INIT_GAME_DIALOG = 'initGameDialog';
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

        this.addDialog(new TextPrompt(TEXT_PROMPT))
        .addDialog(new WaterfallDialog(INIT_GAME_DIALOG, [
            this.pickGameStep.bind(this)
        ])).addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
            this.promptUserStep.bind(this),
            this.processCommandStep.bind(this)
        ]));

        this.initialDialogId = INIT_GAME_DIALOG;
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

    /**
     * First step in the waterfall dialog. Prompts the user for a command.
     * Currently, this expects a booking request, like "book me a flight from Paris to Berlin on march 22"
     * Note that the sample LUIS model will only recognize Paris, Berlin, New York and London as airport cities.
     */
    async pickGameStep(stepContext) {
        let gameName = "zork1";
        let gameCommand  = stepContext.context.activity.text;

        switch(gameCommand) {
            case "Launch Zork 1":
                gameName = "zork1";
                break;
            case "Launch Zork 2":
                gameName = "zork2";
                break;
            case "Launch Zork 3":
                gameName = "zork3";
                break;
            case "Launch The Hitchhiker\'s Guide to the Galaxy":
                gameName = "hike";
                break;
            case "Launch Spellbreaker":
                gameName = "spellbreak";
                break;
            case "Launch Wishbringer":
                gameName = "wishbring";
                break;
            default:
                gameName = "zork1";
                break;
        }

        let loadText = await axios.get('http://zorkhub.eastus.cloudapp.azure.com:443/start?game=' + gameName)
            .then(function(response){

                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });
        await stepContext.context.sendActivity( loadText );
        
        let firstLine = await axios.get('http://zorkhub.eastus.cloudapp.azure.com:443/check')
        .then(function(response){
            console.log(response.data); // ex.: { user: 'Your User'}
            console.log(response.status); // ex.: 200
            return response.data;
        });
        await stepContext.context.sendActivity( firstLine );
        this.lastLine = "What would you like to to?";
        return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);    
    }

    async promptUserStep(stepContext) {
        return await stepContext.prompt(TEXT_PROMPT, { prompt: this.lastLine });
    }

    async processCommandStep(stepContext) {

        let command = {};
        if (process.env.LuisAppId 
            && process.env.LuisAPIKey 
            && process.env.LuisAPIHostName) {
            command = await LuisHelper.executeLuisQuery(this.logger, stepContext.context);
            this.logger.log('LUIS extracted these command details: ', command);
        }

        let response = await axios.get('http://zorkhub.eastus.cloudapp.azure.com:443/action?cmd=' + encodeURIComponent(command.text))
            .then(function(response){
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });

        this.lastLine = response;
        
        if (command.text == "exit program") {
            return await stepContext.endDialog(stepContext);
            
        } else {
            return await stepContext.replaceDialog(LOOP_GAME_DIALOG, []);
        }
    }
}

module.exports.MainDialog = MainDialog;
