// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, ConfirmPrompt, WaterfallDialog } = require('botbuilder-dialogs');
const { LuisHelper } = require('./luisHelper');


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

        this.newGameRegex = new RegExp('[~Launch Zork 1|~Launch Zork 2|~Launch Zork 3|~Launch The Hitchhiker\'s Guide to the Galaxy|~Launch Spellbreaker|~Launch Wishbringer]$');
        this.lastLine = "";

        this.logger = logger;

        this.userEmail      = "";
        this.newUser        = true;
        this.lastSaveFile   = "AutoSave";
        this.hike           = [];
        this.spell          = [];
        this.wish           = [];
        this.zork1          = [];
        this.zork2          = [];
        this.zork3          = [];

        this.title      = "";

        this.newGameCommand = "";

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
        .addDialog(new WaterfallDialog(GET_INFO_DIALOG, [
            this.setUserStep.bind(this),
            this.getEmailSetp.bind(this),
        ]))
        .addDialog(new WaterfallDialog(PICK_GAME_DIALOG, [
            this.pickGameStep.bind(this)
        ]))
        .addDialog(new WaterfallDialog(LOOP_GAME_DIALOG, [
            this.promptUserStep.bind(this),
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

    // setting users and picking games are going to be some of the more
    // dynamic thigns that I do... Hopefully I can make custom cards for 
    // them
    async setUserStep(stepContext) {
        this.newGameCommand = stepContext.context.activity.text;
        if (stepContext.message && stepContext.message.entities){
            var userInfo = stepContext.message.entities.find((e) => {
                return e.type === 'UserInfo';
            });
            if (userInfo) {
                var email = userInfo.UserEmail;

                if(email && email !== ''){
                    let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com:443/user?email=' + email)
                        .then(function(response){
                            console.log(response.data);
                            console.log(response.status);
                            return response.data;
                        });

                    //set all user info from the return... 
                    this.userEmail      = newUserResponse.userEmail;
                    this.newUser        = newUserResponse.newUser;
                    this.lastSaveFile   = newUserResponse.lastSaveFile;
                    this.hike           = newUserResponse.hike;
                    this.spell          = newUserResponse.spell;
                    this.wish           = newUserResponse.wish;
                    this.zork1          = newUserResponse.zork1;
                    this.zork2          = newUserResponse.zork2;
                    this.zork3          = newUserResponse.zork3;

                    // say hello to the new person.
                    stepContext.replaceDialog(PICK_GAME_DIALOG, stepContext);
                }
            }
        }
        //if we somehow don't exit, pull email here
        return await stepContext.prompt(TEXT_PROMPT, { prompt: "It appears that the bot can't find an email to auto-gen you an account... please enter an email or other identifier, and I\'ll use it to store your saves" });
    }

    async getEmailSetp(stepContext) {
            
        let newUserResponse = await axios.get('http://zorkhub.eastus.cloudapp.azure.com:443/user?email=' + stepContext.context.activity.text)
            .then(function(response){
                console.log(response.data);
                console.log(response.status);
                return response.data;
            });

        //Once you've gotten email, 
        //set all user info from the return... 
        this.userEmail      = newUserResponse.userEmail;
        this.lastSaveFile   = newUserResponse.lastSaveFile;
        this.hike           = newUserResponse.hike;
        this.spell          = newUserResponse.spell;
        this.wish           = newUserResponse.wish;
        this.zork1          = newUserResponse.zork1;
        this.zork2          = newUserResponse.zork2;
        this.zork3          = newUserResponse.zork3;

        // say hello to the new person.  
        stepContext.replaceDialog(PICK_GAME_DIALOG, stepContext);
    }

    async pickGameStep(stepContext) {

        switch(this.newGameCommand) {
            case "~Launch Zork 1":
                this.title = "zork1";
                break;
            case "~Launch Zork 2":
                this.title = "zork2";
                break;
            case "~Launch Zork 3":
                this.title = "zork3";
                break;
            case "~Launch The Hitchhiker\'s Guide to the Galaxy":
                this.title = "hike";
                break;
            case "~Launch Spellbreaker":
                this.title = "spellbreak";
                break;
            case "~Launch Wishbringer":
                this.title = "wishbring";
                break;
            default:
                this.title = "zork1";
                break;
        }

        let startResponse = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com:443/start?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile == null ? "AutoSave" : this.lastSaveFile}`)
            .then(function(response){
                console.log(response.data); // ex.: { user: 'Your User'}
                console.log(response.status); // ex.: 200
                return response.data;
            });


        await stepContext.context.sendActivity( startResponse.titleinfo );
        await stepContext.context.sendActivity( startResponse.firstLine );

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

        let response = await axios.get(`http://zorkhub.eastus.cloudapp.azure.com:443/action?title=${this.title}&email=${this.userEmail}&save=${this.lastSaveFile == null ? "AutoSave" : this.lastSaveFile}&action=${command.text}`)
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
