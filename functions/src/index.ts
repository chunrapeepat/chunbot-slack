import * as functions from "firebase-functions";
import { WebClient } from "@slack/web-api";
import { PubSub } from "@google-cloud/pubsub";

import {
  createInvoice,
  createOrder,
  createPayment,
  createSession,
  getExpenseSummary,
  getInvoiceMessage,
  getPayme,
  getPayments,
  getSession,
  getSummaryMessage,
  updateSessionPaymeId,
} from "./payme";
import Axios from "axios";

const PANG_USER_ID = "USGBWTJDA";
const PANG_USERNAME = "Chanissa Trithipkaiwanpon";

const bot = new WebClient(functions.config().slack.token);
const pubsubClient = new PubSub();

const sendMessage = (channel: string, text: string) => {
  return bot.chat.postMessage({
    channel,
    text,
  });
};
const replyMessage = (channel: string, thread_ts: string, text: string) => {
  return bot.chat.postMessage({
    channel,
    thread_ts,
    text,
  });
};

const updateMessage = (channel: string, ts: string, text: string) => {
  return bot.chat.update({
    channel,
    ts,
    text,
  });
};

const getUsers = async () => {
  const queryUsers = await bot.users.list();
  if (queryUsers.ok) {
    return queryUsers.members as any[];
  } else {
    return [];
  }
};

export const myBot = functions.https.onRequest(async (req, res) => {
  const data = JSON.stringify(req.body);
  const { challenge } = req.body;
  const dataBuffer = Buffer.from(data);

  await pubsubClient.topic("slack-channel").publisher.publish(dataBuffer);

  res.status(200).send({ challenge });
  return;
});

export const sendInvoice = functions.firestore
  .document(`feedme/{sessionId}`)
  .onUpdate(async (change, context) => {
    const session = change.after.data();
    const sessionBefore = change.before.data();

    if (
      session === undefined ||
      session.closed === false ||
      session.statement === undefined
    ) {
      console.error(
        `Error: session must be closed or statement must not be undefined`
      );
      return;
    }
    await Axios.get(
      "https://pang-wallet-service-4r4kliwroa-as.a.run.app/group",
      {
        headers: {
          "x-api-key": "earth",
        },
      }
    );
    if (
      session.statement !== sessionBefore.statement &&
      session.closed !== sessionBefore.closed
    ) {
      const users: any[] = await getUsers();
      let paymentSuccessUser: any = [];
      // auto payment via pang wallet
      if (session.userId === PANG_USER_ID) {
        const { statement } = session;
        const orders = statement.orders;
        const map = orders.reduce((result: any, curr: any) => {
          if (!result[curr.username]) result[curr.username] = [];
          result[curr.username].push(+curr.charge);
          return result;
        }, {});
        paymentSuccessUser = await Promise.all(
          Object.keys(map).map(async (username) => {
            const total = map[username].reduce(
              (a: number, b: number) => a + b,
              0
            );
            const shipping = statement.shipping / orders.length;
            try {
              const response = await Axios.post(
                "https://pang-wallet-service-4r4kliwroa-as.a.run.app/create-debt",
                {
                  creditorId: PANG_USERNAME,
                  debtorId: username,
                  amount: Math.ceil(total + +shipping),
                  note: `${session.statement.restaurant} | ${username}`,
                },
                {
                  headers: {
                    "x-api-key": "earth",
                  },
                }
              );
              await createPayment(
                String(new Date().getTime),
                String(new Date().getTime),
                username,
                username,
                [],
                "prepaid id: " + response.data.debt.id
              );
              return {
                expenseId: response.data.debt.id,
                postedBy: username,
                cost: Number(response.data.debt.cost),
              };
            } catch (error) {
              return "";
            }
          })
        );
      }

      const messageResponse: any = await sendMessage(
        "#pay-me",
        await getInvoiceMessage(session, [], users, false, paymentSuccessUser)
      );
      if (!messageResponse.ok || !messageResponse.ts) {
        console.error(`Error: send message error`);
        return;
      }
      if (session.userId === PANG_USER_ID) {
        try {
          await replyMessage(
            "#pay-me",
            messageResponse.ts,
            getExpenseSummary(paymentSuccessUser)
          );
        } catch (error) {}
        const summaryMessageResponse: any = await replyMessage(
          "#pay-me",
          messageResponse.ts,
          await getSummaryMessage()
        );
        if (!summaryMessageResponse.ok || !summaryMessageResponse.ts) {
          console.error(`Error: send message error`);
          return;
        }
      }
      await createInvoice(messageResponse.ts, session.id);
      await updateSessionPaymeId(session.id, messageResponse.ts);
    } else {
      console.error(`Nothing Change`);
    }
  });

export const slackChannel = functions.pubsub
  .topic("slack-channel")
  .onPublish(async (message, ctx) => {
    const { event } = message.json;
    const channel: any = await bot.conversations.info({
      channel: event.channel,
    });
    const user: any = await bot.users.profile.get({ user: event.user });

    // watch #feed-me channels (app-mention)
    if (channel.ok && channel.channel.name === "feed-me") {
      if (event.type === "app_mention") {
        await createSession(event.event_ts, user.profile.real_name, event.user);
        await sendMessage(
          "#feed-me",
          `Session ID: ${event.event_ts} (<@${event.user}>`
        );
      }
      if (event.type === "message" && event.thread_ts !== undefined) {
        await createOrder(
          event.event_ts,
          event.thread_ts,
          user.profile.real_name,
          event.user,
          event.text
        );
      }
    }

    // watch #pay-me reply
    if (channel.ok && channel.channel.name === "pay-me") {
      if (
        event.type === "message" &&
        event.thread_ts !== undefined &&
        event.files !== undefined
      ) {
        await createPayment(
          event.event_ts,
          event.thread_ts,
          user.profile.real_name,
          event.user,
          event.files.map((f: any) => f.url_private)
        );

        // update message
        const payme: any = await getPayme(event.thread_ts);
        const payments = await getPayments(event.thread_ts);
        const session: any = await getSession(payme.sessionId);

        const users: any[] = await getUsers();
        await updateMessage(
          event.channel,
          event.thread_ts,
          await getInvoiceMessage(session, payments, users, true)
        );
      }
    }
  });
