import Axios from "axios";
import * as admin from "firebase-admin";

admin.initializeApp();
const firestore = admin.firestore();

const PANG_USER_ID = "USGBWTJDA";
const PANG_USERNAME = "Chanissa Trithipkaiwanpon";

export const getPayments = async (paymeId: string) => {
  const ref = firestore.collection("payme").doc(paymeId).collection("payments");
  const snapshot = await ref.get();

  if (snapshot.empty) {
    return [];
  }

  const payments: any[] = [];
  snapshot.forEach((doc) => {
    payments.push(doc.data());
  });

  return payments;
};

const renderOrdersWithTopup = async (
  orders: any[],
  shipping: number,
  payments: any[],
  users: any[]
) => {
  let output = "";

  const map = orders.reduce((result, curr) => {
    if (!result[curr.username]) result[curr.username] = [];
    result[curr.username].push(+curr.charge);
    return result;
  }, {});

  const outputs = await Promise.all(
    Object.keys(map).map(async (username) => {
      const total = map[username].reduce((a: number, b: number) => a + b, 0);
      let isPrepaid = false;
      try {
        await Axios.post(
          "https://pang-wallet-service-4r4kliwroa-as.a.run.app/create-debt",
          {
            creditorId: PANG_USERNAME,
            debtorId: username,
            amount: total + +shipping,
            note: "created by chunbot",
          },
          {
            headers: {
              "x-api-key": "earth",
            },
          }
        );
        isPrepaid = true;
      } catch (error) {
        isPrepaid = false;
      }
      const isPaid = payments.filter((p) => p.postedBy === username).length > 0;
      const user = users.find(
        (u) =>
          u.name === username ||
          u.real_name === username ||
          u.profile.real_name === username ||
          u.profile.display_name === username
      );
      let mention = "";
      if (!user) {
        mention = `@${username}`;
      } else {
        mention = `<@${user.id}>`;
      }
      if (isPrepaid)
        return `✅ 🎖 ${mention} ${Math.ceil(
          total + +shipping
        )} 🎖 paid by pre-paid feature 🎖`;
      return `${isPaid ? "✅" : "😡"} ${mention} ${Math.ceil(
        total + +shipping
      )}`;
    })
  );
  output = outputs.join("\n");

  return output;
};
const renderOrders = (
  orders: any[],
  shipping: number,
  payments: any[],
  users: any[]
) => {
  let output = "";

  const map = orders.reduce((result, curr) => {
    if (!result[curr.username]) result[curr.username] = [];
    result[curr.username].push(+curr.charge);
    return result;
  }, {});

  Object.keys(map).forEach((username) => {
    const total = map[username].reduce((a: number, b: number) => a + b, 0);
    const isPaid = payments.filter((p) => p.postedBy === username).length > 0;
    const user = users.find(
      (u) =>
        u.name === username ||
        u.real_name === username ||
        u.profile.real_name === username ||
        u.profile.display_name === username
    );
    let mention = "";
    if (!user) {
      mention = `@${username}`;
    } else {
      mention = `<@${user.id}>`;
    }

    output += `${isPaid ? "✅" : "😡"} ${mention} ${Math.ceil(
      total + +shipping
    )}\n`;
  });

  return output;
};

export const getInvoiceMessage = async (
  session: any,
  payments: any[],
  users: any[]
) => {
  const { statement } = session;
  const orders = statement.orders;
  let orderMessage = "";
  if (session.userId == PANG_USER_ID) {
    orderMessage = await renderOrdersWithTopup(
      orders,
      statement.shipping / orders.length,
      payments,
      users
    );
  } else {
    orderMessage = renderOrders(
      orders,
      statement.shipping / orders.length,
      payments,
      users
    );
  }

  return `ร้านอาหาร: ${statement.restaurant}, Promptpay: ${
    statement.promptpay
  } (<@${session.userId}>)
ค่าส่ง: ${statement.shipping}บาท (ราคาด้านล่างนี้รวมค่าส่งแล้ว)
  
${orderMessage}

Note: ${statement.note || ""} (${session.id})
Promptpay Scan: https://promptpay.io/${statement.promptpay}
`;
};

export const getPayme = async (paymeId: string) => {
  const paymeRef = firestore.collection("payme").doc(paymeId);
  const doc = await paymeRef.get();

  if (!doc.exists) {
    return undefined;
  }

  return doc.data();
};

export const getSession = async (sessionId: string) => {
  const sessionRef = firestore.collection("feedme").doc(sessionId);
  const doc = await sessionRef.get();

  if (!doc.exists) {
    return undefined;
  }

  return doc.data();
};

export const createInvoice = async (id: string, sessionId: string) => {
  return firestore.collection("payme").doc(id).set({
    id,
    sessionId,
    createdAt: Date.now(),
  });
};

export const updateSessionPaymeId = async (
  sessionId: string,
  paymeId: string
) => {
  return firestore.collection("feedme").doc(sessionId).update({ paymeId });
};

export const createSession = async (
  id: string,
  postedBy: string,
  userId: string
) => {
  return firestore.collection("feedme").doc(id).set({
    id,
    postedBy,
    userId,
    closed: false,
    createdAt: Date.now(),
  });
};

export const createOrder = async (
  id: string,
  sessionId: string,
  postedBy: string,
  userId: string,
  description: string
) => {
  const sessionRef = firestore.collection("feedme").doc(sessionId);
  const doc = await sessionRef.get();

  if (!doc.exists) {
    return;
  }

  const session: any = doc.data();
  if (session.closed) {
    return;
  }

  return sessionRef.collection("orders").doc(id).set({
    id,
    postedBy,
    userId,
    description,
    sessionId,
    createdAt: Date.now(),
  });
};

export const createPayment = async (
  id: string,
  paymeId: string,
  postedBy: string,
  userId: string,
  files: string[]
) => {
  const paymeRef = firestore.collection("payme").doc(paymeId);
  const doc = await paymeRef.get();

  if (!doc.exists) {
    return;
  }

  return paymeRef.collection("payments").doc(id).set({
    id,
    paymeId,
    postedBy,
    userId,
    files,
    createdAt: Date.now(),
  });
};
