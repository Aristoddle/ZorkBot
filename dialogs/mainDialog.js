// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');


const INIT_GAME_DIALOG = 'initGameDialog';
const LOOP_GAME_DIALOG = 'loopGameDialog';
const ASK_EMAIL_DIALOG = 'askEmailDialog';
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

        this.newGameRegex = new RegExp('[~Launch Zork 1|~Launch Zork 2|~Launch Zork 3|~Launch The Hitchhiker\'s Guide to the Galaxy|~Launch Spellbreaker|~Launch Wishbringer]$');
        this.lastLine = "";

        this.logger = logger;

        //TODO:

        /*
          *
          So, the first dialog flow (init game dialog), should try to get
          your email, so that i can use it to block out storage.
          It should have a few functions that loop until we have found it.

          After it has been found, we can hot-jump down to the 
          "select game and save file" dialogues (which I hope to expand
            using cards)

          And after that, only then do we go down to the acutal gameplay 
          loops.

          Once in the gameplay loop, I'll just need to beat each of these
          games repeatedly, and hammer out the LUIS inputs for them.
          
           */
        this.addDialog(new TextPrompt(TEXT_PROMPT))
        .addDialog(new WaterfallDialog(INIT_GAME_DIALOG, [
            this.setUserStep.bind(this),
            this.pickGameStep.bind(this)
        ])).addDialog(new WaterfallDialog(ASK_EMAIL_DIALOG), [
            this.validateUserEmail.bind(this)
        ])
        .addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
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

    // setting users and picking games are going to be some of the more
    // dynamic thigns that I do... Hopefully I can make custom cards for 
    // them
    async setUserStep(stepContext) {
        if (session.message && session.message.entities){
            var userInfo = session.message.entities.find((e) => {
                return e.type === 'UserInfo';
            });
    
        if (userInfo) {
            var email = userInfo.UserEmail;

            if(email && email !== ''){
                let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com/user?email=' + email)
                    .then(function(response){
                        console.log(response.data);
                        console.log(response.status);
                        return response.data;
                    });
                // say hello to the new person.  
                stepContext.next(stepContext);              
            }
        }
        else {
            stepContext.replaceDialog()
        }

    async pickGameStep(stepContext) {
        let gameName = "zork1";
        let gameCommand  = stepContext.context.activity.text;

        switch(gameCommand) {
            case "~Launch Zork 1":
                gameName = "zork1";
                break;
            case "~Launch Zork 2":
                gameName = "zork2";
                break;
            case "~Launch Zork 3":
                gameName = "zork3";
                break;
            case "~Launch The Hitchhiker\'s Guide to the Galaxy":
                gameName = "hike";
                break;
            case "~Launch Spellbreaker":
                gameName = "spellbreak";
                break;
            case "~Launch Wishbringer":
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

        if (command.text.match(this.newGameRegex)) {
            return await stepContext.replaceDialog(INIT_GAME_DIALOG, stepContext);
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
