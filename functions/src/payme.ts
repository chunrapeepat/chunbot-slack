import * as admin from 'firebase-admin';

admin.initializeApp();
const firestore = admin.firestore();

export const createSession = async (id: string, postedBy: string) => {
  return firestore.collection("payme").doc(id).set({
    id,
    postedBy,
    closed: false,
    createdAt: Date.now(),
  });
};

export const createOrder = async (id: string, sessionId: string, postedBy: string, description: string) => {
  const sessionRef = firestore.collection("payme").doc(sessionId);
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
    description,
    sessionId,
    createdAt: Date.now(),
  });
};
