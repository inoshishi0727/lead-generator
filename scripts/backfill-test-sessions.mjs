#!/usr/bin/env node
/**
 * Backfill isTest:true on Sommelier conversations + usage that originated from
 * internal QA. Matches against INTERNAL_EMAIL_PATTERNS (audit-test*, qa-*,
 * test+*) against stored fields AND a scan of the messages subcollection (to
 * catch sessions where the email was typed mid-conversation, not stored as a
 * field).
 *
 * Usage:
 *   node scripts/backfill-test-sessions.mjs              # dry-run, prints would-tag count
 *   node scripts/backfill-test-sessions.mjs --apply      # writes isTest:true on matches
 *   node scripts/backfill-test-sessions.mjs --apply --delete  # hard-delete matches instead of tagging
 *
 * Requires firebase-admin auth — either GOOGLE_APPLICATION_CREDENTIALS env var
 * pointing to a service account JSON, or running in an environment with
 * Application Default Credentials (gcloud auth application-default login).
 */

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const DELETE = process.argv.includes("--delete");
const SCRIPT_TAG = "backfill-test-sessions";

// Mirrors frontend/src/lib/test-traffic.ts INTERNAL_EMAIL_PATTERNS.
// Keep in sync if those patterns change.
const INTERNAL_EMAIL_PATTERNS = [
  /audit-test/i,
  /^qa-/i,
  /^test\+/i,
  /@asterleybros\.com$/i, // internal team domain — flag as test by default
];

// Probe text that's clearly a QA injection attempt.
const PROBE_PATTERNS = [
  /<script[^>]*>/i,
  /alert\s*\(\s*1\s*\)/i,
  /onerror\s*=/i,
];

function looksInternal(text) {
  if (!text) return false;
  const s = String(text);
  if (INTERNAL_EMAIL_PATTERNS.some((re) => re.test(s))) return true;
  if (PROBE_PATTERNS.some((re) => re.test(s))) return true;
  return false;
}

async function initAdmin() {
  // Prefer GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON.
  // Fall back to ADC if the env var is unset.
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const json = JSON.parse(readFileSync(credPath, "utf-8"));
    initializeApp({ credential: cert(json) });
  } else {
    initializeApp({ credential: applicationDefault() });
  }
  return getFirestore();
}

async function scanMessagesSubcollection(db, sessionId) {
  // Scan the first N messages of the subcollection looking for internal markers.
  const msgsSnap = await db
    .collection("sommelier_conversations")
    .doc(sessionId)
    .collection("messages")
    .limit(20)
    .get();
  for (const msgDoc of msgsSnap.docs) {
    const m = msgDoc.data();
    if (looksInternal(m.content) || looksInternal(m.metadata)) return true;
  }
  return false;
}

async function main() {
  console.log(`[${SCRIPT_TAG}] mode: ${APPLY ? (DELETE ? "APPLY (hard delete)" : "APPLY (tag isTest:true)") : "DRY-RUN"}`);
  const db = await initAdmin();

  const convSnap = await db.collection("sommelier_conversations").get();
  console.log(`[${SCRIPT_TAG}] scanning ${convSnap.size} sommelier_conversations…`);

  const matched = [];
  for (const docSnap of convSnap.docs) {
    const data = docSnap.data();
    // Fast path: top-level field checks.
    let isInternal =
      looksInternal(data.firstUserMessage) ||
      looksInternal(data.userEmail) ||
      looksInternal(data.email) ||
      looksInternal(data.pageUrl);

    // Slow path only if fast path didn't match: scan messages.
    if (!isInternal) {
      isInternal = await scanMessagesSubcollection(db, docSnap.id);
    }

    if (isInternal) {
      matched.push({ sessionId: docSnap.id, lastActive: data.lastActive, firstUserMessage: data.firstUserMessage });
    }
  }

  console.log(`[${SCRIPT_TAG}] matched ${matched.length} of ${convSnap.size} sessions`);
  if (matched.length === 0) {
    console.log(`[${SCRIPT_TAG}] nothing to do.`);
    return;
  }

  // Preview the first 10 matches.
  console.log(`[${SCRIPT_TAG}] preview (up to 10):`);
  for (const m of matched.slice(0, 10)) {
    const firstMsg = (m.firstUserMessage || "").slice(0, 80);
    console.log(`  - ${m.sessionId} (lastActive=${m.lastActive}) "${firstMsg}"`);
  }

  if (!APPLY) {
    console.log(`[${SCRIPT_TAG}] dry-run complete. Re-run with --apply to ${DELETE ? "delete" : "tag isTest:true"}.`);
    return;
  }

  // Tag or delete.
  const matchedIds = new Set(matched.map((m) => m.sessionId));
  let tagged = 0;
  let deleted = 0;
  let taggedUsage = 0;

  for (const sessionId of matchedIds) {
    if (DELETE) {
      // Hard delete: conversation doc + its messages subcollection + usage docs joined by sessionId.
      const msgsSnap = await db
        .collection("sommelier_conversations")
        .doc(sessionId)
        .collection("messages")
        .get();
      const batch = db.batch();
      msgsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(db.collection("sommelier_conversations").doc(sessionId));
      await batch.commit();
      deleted++;
    } else {
      await db.collection("sommelier_conversations").doc(sessionId).update({
        isTest: true,
        taggedBy: SCRIPT_TAG,
        taggedAt: FieldValue.serverTimestamp(),
      });
      tagged++;
    }

    // sommelier_usage rows joined by sessionId: tag or delete.
    const usageSnap = await db
      .collection("sommelier_usage")
      .where("sessionId", "==", sessionId)
      .get();
    for (const usageDoc of usageSnap.docs) {
      if (DELETE) {
        await usageDoc.ref.delete();
      } else {
        await usageDoc.ref.update({
          isTest: true,
          taggedBy: SCRIPT_TAG,
          taggedAt: FieldValue.serverTimestamp(),
        });
        taggedUsage++;
      }
    }
  }

  if (DELETE) {
    console.log(`[${SCRIPT_TAG}] DELETED ${deleted} conversations + their messages and usage rows.`);
  } else {
    console.log(`[${SCRIPT_TAG}] tagged ${tagged} conversations + ${taggedUsage} usage rows as isTest:true.`);
  }
}

main().catch((err) => {
  console.error(`[${SCRIPT_TAG}] error:`, err);
  process.exit(1);
});
