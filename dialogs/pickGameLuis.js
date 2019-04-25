// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { LuisRecognizer } = require('botbuilder-ai');

class PickGameLuis {
    /**
     * Returns an object with preformatted LUIS results for the bot's dialogs to consume.
     * @param {*} logger
     * @param {TurnContext} context
     */
    static async executeLuisQuery(logger, context) {
        const actionDetails = {};

        try {
            const recognizer = new LuisRecognizer({
                applicationId: process.env.GameChoiceLuisAppID,
                endpointKey: process.env.GameChoiceLuisAPIKey,
                endpoint: `https://${ process.env.GameChoiceLuisAPIHostName }`
            }, {}, true);

            const recognizerResult = await recognizer.recognize(context);
            // TODO: Figure this out
            //Okay, so HERE, we are pulling the real shit from LUIS...  
            const intent = LuisRecognizer.topIntent(recognizerResult);
            const entities = recognizerResult.entities;
            const text = recognizerResult.text;

            actionDetails.entities = entities;
            actionDetails.intent = intent;
            actionDetails.text = text;
        } catch (err) {
            logger.warn(`LUIS Exception: ${ err } Check your LUIS configuration`);
        }
        return actionDetails;
    }

    static parseCompositeEntity(result, compositeName, entityName) {
        const compositeEntity = result.entities[compositeName];
        if (!compositeEntity || !compositeEntity[0]) return undefined;

        const entity = compositeEntity[0][entityName];
        if (!entity || !entity[0]) return undefined;

        const entityValue = entity[0][0];
        return entityValue;
    }

    static parseDatetimeEntity(result) {
        const datetimeEntity = result.entities['datetime'];
        if (!datetimeEntity || !datetimeEntity[0]) return undefined;

        const timex = datetimeEntity[0]['timex'];
        if (!timex || !timex[0]) return undefined;

        const datetime = timex[0].split('T')[0];
        return datetime;
    }
}

module.exports.PickGameLuis = PickGameLuis;
