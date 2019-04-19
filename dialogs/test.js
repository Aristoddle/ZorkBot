const json = `
[{
    "name": "welcome",
    "type": "waterfall",
    "steps": [
        {
            "id": 0,
            "data": [
                {
                    "type": "text",
                    "value": "Hey, It's nice to meet you."
                },
                {
                    "type": "quickReplies",
                    "value": "What do you want to do next?",
                    "options": [
                        {
                            "text": "some option 1",
                            "value": "option1"
                        },
                        {
                            "text": "some option 2",
                            "value": "option2"
                        }
                    ]
                }
            ],
            "next": [
                {
                    "result": "option1",
                    "action": "dialog2"
                },
                {
                    "result": "option2",
                    "action": "dialog3"
                }
            ]
        }
    ]
},{
    "name":"dialog2",
    "type": "waterfall",
    "steps": [
        {
            "data": [
                {
                    "type": "text",
                    "value": "Hey, this is dialig2."
                }]
        }
    ]
},{
    "name":"dialog3",
    "type": "waterfall",
    "steps": [
        {
            "data": [
                {
                    "type": "text",
                    "value": "Hey, this is dialig3."
                }]
        }
    ]
}]
`;

const generateSignleStep = (step) => {
    return (session, args, next) => {
        step.forEach(sentence => {
            switch (sentence.type) {
                case 'quickReplies':
                    let choices = sentence.options.map(item => {
                        return item.value
                    });
                    let card = new builder.ThumbnailCard(session)
                        .text(sentence.value)
                        .buttons(sentence.options.map(choice => new builder.CardAction.imBack(session, choice.value, choice.text)))
                    let message = new builder.Message(session).addAttachment(card);
                    builder.Prompts.choice(session, message, choices);
                    break;
                case 'text':
                default:
                    session.send(sentence.value)
                    break;
            }
        })
    }
}

const generatenextAction = (actions) => {
    return (session, args, next) => {
        const response = args.response;
        actions.map(action => {
            if (action.result == response.entity) {
                session.beginDialog(action.action);
            }
        })
    }
}
const generateWaterfallSteps = (steps) => {
    let waterfall = [];
    steps.forEach(step => {
        waterfall.push(generateSignleStep(step.data));
        if (step.next) {
            waterfall.push(generatenextAction(step.next));
        }
    });
    return waterfall;
}
var bot = new builder.UniversalBot(connector);
const jsonobj = JSON.parse(json);
jsonobj.forEach(dialog => {
    bot.dialog(dialog.name, generateWaterfallSteps(dialog.steps))
        .triggerAction({
            matches: new RegExp(dialog.name, "g")
        })
});