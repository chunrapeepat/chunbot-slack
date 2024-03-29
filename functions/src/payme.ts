import Axios from "axios";
import * as admin from "firebase-admin";
import { logMessage } from "./logger";

admin.initializeApp();
const firestore = admin.firestore();

const PANG_USER_ID = "USGBWTJDA";
const EARTH_USER_ID = "USGRNF55K";
// const PANG_USERNAME = "Chanissa Trithipkaiwanpon";

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
  additional: number,
  payments: any[],
  users: any[],
  isUpdate: boolean,
  alreadyPaidUser: any[],
  session: any
) => {
  let output = "";

  const map = orders.reduce((result, curr) => {
    if (!result[curr.username]) result[curr.username] = [];
    result[curr.username].push(+curr.charge);
    return result;
  }, {});
  const fullPayment = [...payments, ...alreadyPaidUser];
  logMessage("fullPAyment >>>" + JSON.stringify(fullPayment));
  logMessage("payer >>>" + JSON.stringify(Object.keys(map)));
  const topupUsersResponse = await Axios.get(
    "https://asia-east2-pang-wallet.cloudfunctions.net/users"
  );
  let sumPrepaid = 0;

  const outputs = Object.keys(map).map((username) => {
    const total = map[username].reduce((a: number, b: number) => a + b, 0);
    const isPaid =
      fullPayment.filter((p) => p.postedBy === username).length > 0;
    let isPrepaid = false;

    try {
      const prepaidUsers = topupUsersResponse.data.users;

      isPrepaid = !!prepaidUsers.find((u: any) => u.slack_id === username);
    } catch (error) {
      isPrepaid = false;
    }

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
    console.log(mention + " is Prepaid >> " + isPrepaid);
    if (isPrepaid) {
      sumPrepaid += Math.ceil(total + +additional);
      return `✅ ${mention} ${Math.ceil(total + +additional)} 🎖 pre-paid 🎖`;
      // if (isPaid || session.createdAt < 1602555800125) {
      // } else
      //   return `😡 ${mention} ${Math.ceil(total + +additional)} 🎖 pre-paid 🎖`;
    }
    return `${isPaid ? "✅" : "😡"} ${mention} ${Math.ceil(
      total + +additional
    )}`;
  });
  output = outputs.join("\n");
  output += `\n\n💰 Total pre-paid: ${sumPrepaid}`;

  return output;
};
const renderOrders = (
  orders: any[],
  additional: number,
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
      total + +additional
    )}\n`;
  });

  return output;
};

export const getExpenseSummary = (payments: any[] = []) => {
  const sumAmount = payments
    .filter((p) => !!p?.cost)
    .reduce((sum, p) => {
      return sum + p.cost;
    }, 0);
  let message = `expense splitwise \n ${
    payments.filter((p) => !!p?.cost).length
  } รายการ ราคารวม ${sumAmount} THB \n`;
  payments
    .filter((p) => !!p?.cost)
    .forEach((p) => {
      message += `@${p.postedBy} >>> ${p.expenseId} ราคา ${p.cost}\n`;
    });
  return message;
};
export const getSummaryMessage = async () => {
  const groupResponse = await Axios.get(
    "https://asia-east2-pang-wallet.cloudfunctions.net/group"
  );
  const groupMembers = (groupResponse.data?.group?.members || []) as any[];

  let message = "สรุปยอดเงินคงเหลือ splitwise \n";
  groupMembers
    .filter(
      (mem) => mem.first_name !== "Chanissa" && Boolean(mem.balance[0]?.amount)
    )
    .sort((a, b) => {
      return Number(a.balance[0]?.amount) - Number(b.balance[0]?.amount);
    })
    .forEach((member) => {
      const { first_name, balance } = member;
      const money = balance[0].amount;
      const icon = money < 100 ? (money < 0 ? "🚨" : "💣") : "🏦";
      message += `${icon} @${first_name}  total ${money} (${
        money < 100 ? (money < 0 ? "เงินหมดแล้ววววว" : "เงินใกล้หมด") : ""
      })\n`;
    });
  return message;
};

export const getInvoiceMessage = async (
  session: any,
  payments: any[],
  users: any[],
  isUpdate: boolean = false,
  alreadyPaidUser = []
) => {
  const { statement } = session;
  const orders = statement.orders;
  let orderMessage = "";
  const additional =
    Number(statement.shipping) / orders.length -
    Number(statement?.discount) / (orders.length + 1);
  if (session.userId === PANG_USER_ID || session.userId === EARTH_USER_ID) {
    logMessage("prepaid user naa >>>" + session.userId);
    orderMessage = await renderOrdersWithTopup(
      orders,
      additional,
      payments,
      users,
      isUpdate,
      alreadyPaidUser,
      session
    );
  } else {
    orderMessage = renderOrders(orders, additional, payments, users);
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
  files: string[],
  description: string = ""
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
    description,
    createdAt: Date.now(),
  });
};
