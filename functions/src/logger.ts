import * as functions from "firebase-functions";

export const logMessage = (msg: string) => {
  functions.logger.info(msg, {
    structuredData: true,
  });
};
