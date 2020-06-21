import * as functions from 'firebase-functions';
import {WebClient} from "@slack/web-api";
import {PubSub} from "@google-cloud/pubsub";

const bot = new WebClient(functions.config().slack.token);
const pubsubClient = new PubSub();

export const myBot = functions.https.onRequest(async (req, res) => {
  const data = JSON.stringify(req.body);
  const {challenge} = req.body;
  const dataBuffer = Buffer.from(data);

  await pubsubClient
    .topic('slack-channel')
    .publisher
    .publish(dataBuffer);

  res.status(200).send({challenge});
  return;
});

export const slackChannel = functions.pubsub.topic('slack-channel')
  .onPublish(async (message, ctx) => {
    const {event} = message.json;

    await bot.chat.postMessage({
      channel: '#pay-me',
      text: JSON.stringify(event),
    })
  });

