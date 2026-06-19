import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const app = getApps().length ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);
const inbound = await db.collection("inbound_replies").count().get();
const responded = await db.collection("leads").where("stage", "==", "responded").count().get();
let replied = "n/a";
try { replied = (await db.collection("leads").where("reply_count", ">", 0).count().get()).data().count; } catch {}
console.log("inbound_replies:", inbound.data().count);
console.log("leads reply_count>0:", replied);
console.log("leads stage=responded:", responded.data().count);
process.exit(0);
