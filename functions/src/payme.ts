import * as admin from 'firebase-admin';

admin.initializeApp();
const firestore = admin.firestore();

export const getInvoiceMessage = async (session: any) => {
  const {statement} = session;
  return `ร้านอาหาร: ${statement.restaurant}, Promptpay: ${statement.promptpay} (<@${session.userId}>)
ค่าส่ง: ${statement.shipping}บาท (ราคาด้านล่างนี้รวมค่าส่งแล้ว)
  
😡 <@${session.userId}> 50 + 20 = 70  
😡 <@${session.userId}> 50 + 20 = 70  
😡 <@${session.userId}> 50 + 20 = 70  
😡 <@${session.userId}> 50 + 20 = 70  
✅ <@${session.userId}> 50 + 20 = 70  
✅ <@${session.userId}> 50 + 20 = 70  
✅ <@${session.userId}> 50 + 20 = 70  

${statement.note || ""}
https://promptpay.io/${statement.promptpay}
`
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

export const updateSessionPaymeId = async (sessionId: string, paymeId: string) => {
  return firestore.collection("feedme").doc(sessionId).update({paymeId});
};

export const createSession = async (id: string, postedBy: string, userId: string) => {
  return firestore.collection("feedme").doc(id).set({
    id,
    postedBy,
    userId,
    closed: false,
    createdAt: Date.now(),
  });
};

export const createOrder = async (id: string, sessionId: string, postedBy: string, userId: string, description: string) => {
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

export const createPayment = async (id: string, paymeId: string, postedBy: string, userId: string, files: string[]) => {
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
